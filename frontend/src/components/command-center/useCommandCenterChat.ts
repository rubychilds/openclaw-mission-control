"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type getMeApiV1UsersMeGetResponse,
  useGetMeApiV1UsersMeGet,
} from "@/api/generated/users/users";
import {
  sendMessageApiV1CommandCenterMessagesPost,
  streamMessagesApiV1CommandCenterMessagesStreamGet,
} from "@/api/generated/command-center/command-center";
import type { CommandCenterMessageRead } from "@/api/generated/model";
import { createExponentialBackoff } from "@/lib/backoff";
import { usePageActive } from "@/hooks/usePageActive";

import type { CommandCenterMessage } from "./CommandCenterMessageCard";
import type { MentionSuggestion } from "./CommandCenterComposer";

let nextLocalId = 0;
const localId = () => `local-${Date.now()}-${++nextLocalId}`;

const SSE_RECONNECT_BACKOFF = {
  baseMs: 1_000,
  factor: 2,
  maxMs: 30_000,
  jitterMs: 500,
};

function apiMessageToLocal(msg: CommandCenterMessageRead): CommandCenterMessage {
  return {
    id: msg.id,
    role: msg.role as "user" | "assistant" | "system",
    content: msg.content,
    source: msg.source ?? null,
    created_at: msg.created_at,
  };
}

export function useCommandCenterChat() {
  const { isSignedIn } = useAuth();
  const isPageActive = usePageActive();
  const [messages, setMessages] = useState<CommandCenterMessage[]>([]);
  const [isSending, setIsSending] = useState(false);
  const messagesRef = useRef<CommandCenterMessage[]>([]);
  messagesRef.current = messages;

  const meQuery = useGetMeApiV1UsersMeGet<
    getMeApiV1UsersMeGetResponse,
    ApiError
  >({ query: { enabled: Boolean(isSignedIn), retry: false } });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, { query: { enabled: Boolean(isSignedIn), retry: false } });

  const profile = meQuery.data?.status === 200 ? meQuery.data.data : null;
  const currentUserName =
    profile?.preferred_name ?? profile?.name ?? profile?.email ?? "You";

  const agents =
    agentsQuery.data?.status === 200 ? agentsQuery.data.data.items : [];
  const boards =
    boardsQuery.data?.status === 200 ? boardsQuery.data.data.items : [];

  // Build mention suggestions for agents and boards
  const mentionSuggestions: MentionSuggestion[] = [
    ...agents.map((agent) => ({
      handle: agent.name.toLowerCase().replace(/\s+/g, "-"),
      label: agent.name,
      type: "agent" as const,
    })),
    ...boards.map((board) => ({
      handle: board.name.toLowerCase().replace(/\s+/g, "-"),
      label: board.name,
      type: "board" as const,
    })),
  ];

  const addMessage = useCallback((msg: CommandCenterMessage) => {
    setMessages((prev) => [...prev, msg]);
  }, []);

  // Deduplicated message insertion (for SSE)
  const upsertMessage = useCallback((msg: CommandCenterMessage) => {
    setMessages((prev) => {
      const exists = prev.some((m) => m.id === msg.id);
      if (exists) return prev;
      return [...prev, msg];
    });
  }, []);

  // SSE stream for real-time messages
  useEffect(() => {
    if (!isPageActive || !isSignedIn) return;

    let isCancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const latestTimestamp = () => {
      const msgs = messagesRef.current;
      if (msgs.length === 0) return undefined;
      return msgs[msgs.length - 1]?.created_at;
    };

    const connect = async () => {
      try {
        const since = latestTimestamp();
        const params = since ? { since } : {};
        const streamResult =
          await streamMessagesApiV1CommandCenterMessagesStreamGet(params, {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          });
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect command center stream.");
        }
        const response = streamResult.data as Response;
        if (!(response instanceof Response) || !response.body) {
          throw new Error("Unable to connect command center stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!isCancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) {
            backoff.reset();
          }
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "message" && data) {
              try {
                const payload = JSON.parse(data) as {
                  message?: CommandCenterMessageRead;
                };
                if (payload.message) {
                  upsertMessage(apiMessageToLocal(payload.message));
                }
              } catch {
                // ignore malformed
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Reconnect handled below.
      }

      if (!isCancelled) {
        if (reconnectTimeout !== undefined) {
          window.clearTimeout(reconnectTimeout);
        }
        const delay = backoff.nextDelayMs();
        reconnectTimeout = window.setTimeout(() => {
          reconnectTimeout = undefined;
          void connect();
        }, delay);
      }
    };

    void connect();

    return () => {
      isCancelled = true;
      abortController.abort();
      if (reconnectTimeout !== undefined) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [isPageActive, isSignedIn, upsertMessage]);

  const handleSlashCommand = useCallback(
    (command: string): boolean => {
      const cmd = command.slice(1).toLowerCase().trim();

      if (cmd === "agents") {
        const agentsList = agents.length > 0
          ? agents
              .map(
                (a) =>
                  `- **${a.name}** — ${a.status ?? "unknown"}${a.is_board_lead ? " (board lead)" : ""}${a.is_gateway_main ? " (gateway main)" : ""}`,
              )
              .join("\n")
          : "No agents found.";
        addMessage({
          id: localId(),
          role: "system",
          content: `**Agents (${agents.length})**\n\n${agentsList}`,
          source: null,
          created_at: new Date().toISOString(),
        });
        return true;
      }

      if (cmd === "boards") {
        const boardsList = boards.length > 0
          ? boards
              .map((b) => `- **${b.name}** — ${b.description || "No description"}`)
              .join("\n")
          : "No boards found.";
        addMessage({
          id: localId(),
          role: "system",
          content: `**Boards (${boards.length})**\n\n${boardsList}`,
          source: null,
          created_at: new Date().toISOString(),
        });
        return true;
      }

      if (cmd === "help") {
        addMessage({
          id: localId(),
          role: "system",
          content: [
            "**Available commands**\n",
            "- `/agents` — List all agents and their status",
            "- `/boards` — List all boards",
            "- `/help` — Show this help message\n",
            "**Mentions**\n",
            "- `@agent-name` — Reference an agent",
            "- `@board-name` — Reference a board\n",
            "**Examples**\n",
            '- "Create a task to research competitors with @researcher on @marketing"',
            '- "What tasks are in progress on @pipeline?"',
          ].join("\n"),
          source: null,
          created_at: new Date().toISOString(),
        });
        return true;
      }

      return false;
    },
    [addMessage, agents, boards],
  );

  const sendMessage = useCallback(
    async (content: string): Promise<boolean> => {
      const trimmed = content.trim();
      if (!trimmed) return false;

      // Handle client-side slash commands
      if (trimmed.startsWith("/")) {
        return handleSlashCommand(trimmed);
      }

      // Add user message optimistically
      const userMsg: CommandCenterMessage = {
        id: localId(),
        role: "user",
        content: trimmed,
        source: currentUserName,
        created_at: new Date().toISOString(),
      };
      addMessage(userMsg);
      setIsSending(true);

      try {
        await sendMessageApiV1CommandCenterMessagesPost({
          content: trimmed,
          source: currentUserName,
        });
        // The real message (with server-assigned ID) will arrive via SSE
        setIsSending(false);
        return true;
      } catch (err) {
        const detail =
          err instanceof ApiError
            ? `${err.status}: ${err.message}`
            : String(err);
        addMessage({
          id: localId(),
          role: "system",
          content: `Failed to send message: ${detail}`,
          source: null,
          created_at: new Date().toISOString(),
        });
        setIsSending(false);
        return false;
      }
    },
    [addMessage, currentUserName, handleSlashCommand],
  );

  return {
    messages,
    isSending,
    sendMessage,
    mentionSuggestions,
    currentUserName,
  };
}

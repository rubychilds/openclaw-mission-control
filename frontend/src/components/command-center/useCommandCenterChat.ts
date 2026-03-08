"use client";

import { useCallback, useRef, useState } from "react";

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

import type { CommandCenterMessage } from "./CommandCenterMessageCard";
import type { MentionSuggestion } from "./CommandCenterComposer";

let nextLocalId = 0;
const localId = () => `local-${Date.now()}-${++nextLocalId}`;

export function useCommandCenterChat() {
  const { isSignedIn } = useAuth();
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
    profile?.display_name ?? profile?.email ?? "You";

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
        // TODO: POST to /api/v1/command-center/messages when backend is ready
        // For now, add a placeholder assistant response
        setTimeout(() => {
          addMessage({
            id: localId(),
            role: "assistant",
            content:
              "Message received. The command center backend is not yet connected — this is a placeholder response.",
            source: "Assistant",
            created_at: new Date().toISOString(),
          });
          setIsSending(false);
        }, 800);

        return true;
      } catch {
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

"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Bot, LayoutGrid, Terminal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

const MENTION_MAX_OPTIONS = 8;
const MENTION_PATTERN = /(?:^|\s)@([A-Za-z0-9_-]{0,31})$/;
const SLASH_PATTERN = /^\/([A-Za-z0-9_-]{0,31})$/;

export type MentionSuggestion = {
  handle: string;
  label: string;
  type: "agent" | "board";
};

const SLASH_COMMANDS = [
  { name: "agents", description: "List all agents" },
  { name: "boards", description: "List all boards" },
  { name: "help", description: "Show available commands" },
] as const;

type MentionTarget = {
  start: number;
  end: number;
  query: string;
};

type SlashTarget = {
  query: string;
};

type CommandCenterComposerProps = {
  placeholder?: string;
  isSending?: boolean;
  disabled?: boolean;
  mentionSuggestions?: MentionSuggestion[];
  onSend: (content: string) => Promise<boolean>;
};

const normalizeMentionHandle = (raw: string): string | null => {
  const trimmed = raw.trim().replace(/^@+/, "");
  if (!trimmed) return null;
  const token = trimmed.split(/\s+/)[0]?.replace(/[^A-Za-z0-9_-]/g, "") ?? "";
  if (!token) return null;
  if (!/^[A-Za-z]/.test(token)) return null;
  return token.slice(0, 32).toLowerCase();
};

const findMentionTarget = (
  text: string,
  caret: number,
): MentionTarget | null => {
  if (caret < 0 || caret > text.length) return null;
  const prefix = text.slice(0, caret);
  const match = prefix.match(MENTION_PATTERN);
  if (!match) return null;
  const query = (match[1] ?? "").toLowerCase();
  const start = caret - query.length - 1;
  return { start, end: caret, query };
};

const findSlashTarget = (text: string): SlashTarget | null => {
  const match = text.match(SLASH_PATTERN);
  if (!match) return null;
  return { query: (match[1] ?? "").toLowerCase() };
};

function CommandCenterComposerImpl({
  placeholder = "Chat with your agents. Use @name to mention agents or boards, /commands for actions.",
  isSending = false,
  disabled = false,
  mentionSuggestions,
  onSend,
}: CommandCenterComposerProps) {
  const [value, setValue] = useState("");
  const [mentionTarget, setMentionTarget] = useState<MentionTarget | null>(
    null,
  );
  const [slashTarget, setSlashTarget] = useState<SlashTarget | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const closeMenuTimeoutRef = useRef<number | null>(null);
  const shouldFocusAfterSendRef = useRef(false);

  const mentionOptions = useMemo(() => {
    const options: MentionSuggestion[] = [];
    const seen = new Set<string>();
    (mentionSuggestions ?? []).forEach((suggestion) => {
      const handle = normalizeMentionHandle(suggestion.handle);
      if (handle && !seen.has(handle)) {
        seen.add(handle);
        options.push({ ...suggestion, handle });
      }
    });
    return options;
  }, [mentionSuggestions]);

  const filteredMentionOptions = useMemo(() => {
    if (!mentionTarget) return [];
    const query = mentionTarget.query;
    return mentionOptions
      .filter((option) => option.handle.startsWith(query))
      .slice(0, MENTION_MAX_OPTIONS);
  }, [mentionOptions, mentionTarget]);

  const filteredSlashCommands = useMemo(() => {
    if (!slashTarget) return [];
    const query = slashTarget.query;
    return SLASH_COMMANDS.filter((cmd) => cmd.name.startsWith(query));
  }, [slashTarget]);

  // Determine which dropdown is active
  const showMentions = mentionTarget && filteredMentionOptions.length > 0;
  const showSlash = !showMentions && slashTarget && filteredSlashCommands.length > 0;
  const dropdownCount = showMentions
    ? filteredMentionOptions.length
    : showSlash
      ? filteredSlashCommands.length
      : 0;

  const safeIndex = dropdownCount > 0 ? Math.min(activeIndex, dropdownCount - 1) : 0;

  useEffect(() => {
    if (isSending) return;
    if (!shouldFocusAfterSendRef.current) return;
    shouldFocusAfterSendRef.current = false;
    textareaRef.current?.focus();
  }, [isSending]);

  useEffect(() => {
    return () => {
      if (closeMenuTimeoutRef.current !== null) {
        window.clearTimeout(closeMenuTimeoutRef.current);
      }
    };
  }, []);

  const refreshTargets = useCallback(
    (nextValue: string, caret: number) => {
      const mentionResult = findMentionTarget(nextValue, caret);
      setMentionTarget(mentionResult);
      // Only check slash if at beginning of input and no mention active
      if (!mentionResult) {
        setSlashTarget(findSlashTarget(nextValue));
      } else {
        setSlashTarget(null);
      }
    },
    [],
  );

  const applyMentionSelection = useCallback(
    (handle: string) => {
      const textarea = textareaRef.current;
      if (!textarea || !mentionTarget) return;
      const replacement = `@${handle} `;
      const nextValue =
        value.slice(0, mentionTarget.start) +
        replacement +
        value.slice(mentionTarget.end);
      setValue(nextValue);
      setMentionTarget(null);
      setSlashTarget(null);
      setActiveIndex(0);
      window.requestAnimationFrame(() => {
        const nextCaret = mentionTarget.start + replacement.length;
        textarea.focus();
        textarea.setSelectionRange(nextCaret, nextCaret);
      });
    },
    [mentionTarget, value],
  );

  const applySlashSelection = useCallback(
    (commandName: string) => {
      const textarea = textareaRef.current;
      setValue(`/${commandName}`);
      setSlashTarget(null);
      setMentionTarget(null);
      setActiveIndex(0);
      // Auto-send slash commands immediately
      window.requestAnimationFrame(() => {
        textarea?.focus();
      });
      void onSend(`/${commandName}`).then((ok) => {
        if (ok) setValue("");
      });
    },
    [onSend],
  );

  const send = useCallback(async () => {
    if (isSending || disabled) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    const ok = await onSend(trimmed);
    shouldFocusAfterSendRef.current = true;
    if (ok) {
      setValue("");
      setMentionTarget(null);
      setSlashTarget(null);
      setActiveIndex(0);
    }
  }, [disabled, isSending, onSend, value]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const hasDropdown = dropdownCount > 0;
      if (hasDropdown) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % dropdownCount);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setActiveIndex(
            (prev) => (prev - 1 + dropdownCount) % dropdownCount,
          );
          return;
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault();
          if (showMentions) {
            const selected = filteredMentionOptions[safeIndex];
            if (selected) applyMentionSelection(selected.handle);
          } else if (showSlash) {
            const selected = filteredSlashCommands[safeIndex];
            if (selected) applySlashSelection(selected.name);
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          setMentionTarget(null);
          setSlashTarget(null);
          setActiveIndex(0);
          return;
        }
      }
      if (event.key !== "Enter") return;
      if (event.nativeEvent.isComposing) return;
      if (event.shiftKey) return;
      event.preventDefault();
      void send();
    },
    [
      dropdownCount,
      showMentions,
      showSlash,
      filteredMentionOptions,
      filteredSlashCommands,
      safeIndex,
      applyMentionSelection,
      applySlashSelection,
      send,
    ],
  );

  return (
    <div className="space-y-2">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={value}
          onChange={(event) => {
            const nextValue = event.target.value;
            setValue(nextValue);
            refreshTargets(
              nextValue,
              event.target.selectionStart ?? nextValue.length,
            );
          }}
          onClick={(event) => {
            refreshTargets(
              value,
              event.currentTarget.selectionStart ?? value.length,
            );
          }}
          onKeyUp={(event) => {
            refreshTargets(
              value,
              event.currentTarget.selectionStart ?? value.length,
            );
          }}
          onBlur={() => {
            if (closeMenuTimeoutRef.current !== null) {
              window.clearTimeout(closeMenuTimeoutRef.current);
            }
            closeMenuTimeoutRef.current = window.setTimeout(() => {
              setMentionTarget(null);
              setSlashTarget(null);
              setActiveIndex(0);
            }, 120);
          }}
          onFocus={(event) => {
            refreshTargets(
              value,
              event.currentTarget.selectionStart ?? value.length,
            );
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="min-h-[100px] resize-none"
          disabled={isSending || disabled}
        />

        {/* @ mention dropdown */}
        {showMentions ? (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="max-h-52 overflow-y-auto py-1">
              {filteredMentionOptions.map((option, index) => (
                <button
                  key={option.handle}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applyMentionSelection(option.handle);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                    index === safeIndex
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    {option.type === "agent" ? (
                      <Bot className="h-3.5 w-3.5 text-slate-400" />
                    ) : (
                      <LayoutGrid className="h-3.5 w-3.5 text-slate-400" />
                    )}
                    <span className="font-mono">@{option.handle}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {option.type === "agent" ? "agent" : "board"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* / slash command dropdown */}
        {showSlash ? (
          <div className="absolute bottom-full left-0 z-20 mb-2 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="max-h-52 overflow-y-auto py-1">
              {filteredSlashCommands.map((cmd, index) => (
                <button
                  key={cmd.name}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    applySlashSelection(cmd.name);
                  }}
                  className={`flex w-full items-center justify-between px-3 py-2 text-left text-sm transition ${
                    index === safeIndex
                      ? "bg-slate-100 text-slate-900"
                      : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Terminal className="h-3.5 w-3.5 text-slate-400" />
                    <span className="font-mono">/{cmd.name}</span>
                  </span>
                  <span className="text-xs text-slate-400">
                    {cmd.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-400">
          Enter to send, Shift+Enter for new line
        </span>
        <Button
          onClick={() => void send()}
          disabled={isSending || disabled || !value.trim()}
          size="sm"
        >
          {isSending ? "Sending…" : "Send"}
        </Button>
      </div>
    </div>
  );
}

export const CommandCenterComposer = memo(CommandCenterComposerImpl);
CommandCenterComposer.displayName = "CommandCenterComposer";
"use client";

import { memo } from "react";
import { Bot, User } from "lucide-react";

import { Markdown } from "@/components/atoms/Markdown";
import { cn } from "@/lib/utils";

export type CommandCenterMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  source: string | null;
  created_at: string;
};

const formatTimestamp = (value: string) => {
  const date = new Date(value);
  if (isNaN(date.getTime())) return "";
  return date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
};

function CommandCenterMessageCardImpl({
  message,
  currentUser,
}: {
  message: CommandCenterMessage;
  currentUser: string;
}) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";
  const sourceLabel = message.source ?? (isUser ? currentUser : "Assistant");

  if (isSystem) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50/60 px-4 py-3">
        <div className="select-text cursor-text text-sm leading-relaxed text-slate-700 break-words">
          <Markdown content={message.content} variant="basic" />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex gap-3",
        isUser ? "flex-row-reverse" : "flex-row",
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-blue-100 text-blue-700"
            : "bg-slate-100 text-slate-600",
        )}
      >
        {isUser ? (
          <User className="h-4 w-4" />
        ) : (
          <Bot className="h-4 w-4" />
        )}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-blue-600 text-white"
            : "border border-slate-200 bg-white text-slate-900",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <p
            className={cn(
              "text-xs font-semibold",
              isUser ? "text-blue-100" : "text-slate-500",
            )}
          >
            {sourceLabel}
          </p>
          <span
            className={cn(
              "text-[10px]",
              isUser ? "text-blue-200" : "text-slate-400",
            )}
          >
            {formatTimestamp(message.created_at)}
          </span>
        </div>
        <div
          className={cn(
            "mt-1 select-text cursor-text text-sm leading-relaxed break-words",
            isUser ? "[&_*]:text-white" : "",
          )}
        >
          <Markdown content={message.content} variant="basic" />
        </div>
      </div>
    </div>
  );
}

export const CommandCenterMessageCard = memo(CommandCenterMessageCardImpl);
CommandCenterMessageCard.displayName = "CommandCenterMessageCard";

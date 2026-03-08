"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef } from "react";

import { SignedIn, SignedOut } from "@/auth/clerk";

import { DashboardShell } from "@/components/templates/DashboardShell";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { CommandCenterComposer } from "@/components/command-center/CommandCenterComposer";
import { CommandCenterMessageCard } from "@/components/command-center/CommandCenterMessageCard";
import { useCommandCenterChat } from "@/components/command-center/useCommandCenterChat";

export default function ChatPage() {
  const { messages, isSending, sendMessage, mentionSuggestions, currentUserName } =
    useCommandCenterChat();
  const messagesEndRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (messages.length === 0) return;
    const timer = setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 50);
    return () => clearTimeout(timer);
  }, [messages.length]);

  return (
    <DashboardShell>
      <SignedOut>
        <SignedOutPanel
          message="Sign in to access the command center."
          forceRedirectUrl="/chat"
        />
      </SignedOut>
      <SignedIn>
        <div className="flex h-[calc(100vh-3.5rem)] flex-col">
          {/* Messages area */}
          <div className="flex-1 overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
                <div className="rounded-2xl border border-slate-200 bg-white px-8 py-10 shadow-sm">
                  <h2 className="font-heading text-xl font-semibold text-slate-900">
                    Command Center
                  </h2>
                  <p className="mt-2 max-w-md text-sm text-slate-500">
                    Chat with your agents to create tasks, check status, and coordinate work.
                    Use <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">@name</code> to
                    mention agents or boards,
                    and <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">/commands</code> for
                    quick actions.
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-400">
                    <span className="rounded-full border border-slate-200 px-3 py-1">/agents</span>
                    <span className="rounded-full border border-slate-200 px-3 py-1">/boards</span>
                    <span className="rounded-full border border-slate-200 px-3 py-1">/help</span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="mx-auto max-w-3xl space-y-4 px-6 py-6">
                {messages.map((msg) => (
                  <CommandCenterMessageCard
                    key={msg.id}
                    message={msg}
                    currentUser={currentUserName}
                  />
                ))}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-slate-200 bg-white px-6 py-4">
            <div className="mx-auto max-w-3xl">
              <CommandCenterComposer
                mentionSuggestions={mentionSuggestions}
                isSending={isSending}
                onSend={sendMessage}
              />
            </div>
          </div>
        </div>
      </SignedIn>
    </DashboardShell>
  );
}

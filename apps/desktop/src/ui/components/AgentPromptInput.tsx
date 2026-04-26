import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronUp,
  MessageSquare,
  Navigation,
  X,
} from "lucide-react";
import { useState, type FormEvent, type KeyboardEvent } from "react";

export type AgentPromptInputProps = {
  onSend?: (message: string) => void;
  onStop?: () => void;
  placeholder?: string;
  disabled?: boolean;
  active?: boolean;
};

export type ReviewPromptKind = "ask" | "steer";

export type ReviewPromptInputProps = {
  targetLabel: string;
  itemCount: number;
  currentIndex: number;
  pendingCount: number;
  acceptLabel: string;
  denyLabel: string;
  active?: boolean;
  disabled?: boolean;
  onAccept?: () => void;
  onDeny?: () => void;
  onNavigate?: (direction: "prev" | "next") => void;
  onSubmit?: (kind: ReviewPromptKind, message: string) => void;
};

function Kbd({ children, className = "" }: { children: string; className?: string }) {
  return (
    <span
      className={`inline-flex min-h-5 items-center rounded border border-neutral-700 bg-neutral-950 px-1.5 font-mono text-[10px] font-medium leading-none text-neutral-300 shadow-sm shadow-black/20 ${className}`}
    >
      {children}
    </span>
  );
}

export function AgentPromptInput({
  onSend,
  onStop,
  placeholder = "Message the agent…",
  disabled = false,
  active = false,
}: AgentPromptInputProps) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (active) {
      onStop?.();
      return;
    }
    const trimmed = value.trim();
    if (!trimmed || disabled) {
      return;
    }
    onSend?.(trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      !event.metaKey &&
      !event.ctrlKey
    ) {
      event.preventDefault();
      submit();
    }
  };

  const canSend = active || (!disabled && value.trim().length > 0);

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-neutral-700/80 bg-neutral-900 p-2 shadow-xl shadow-black/30 transition focus-within:border-sky-500/70 focus-within:ring-2 focus-within:ring-sky-500/15"
    >
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={2}
          className="box-border max-h-40 min-h-16 w-full resize-none border-0 bg-transparent py-2 pl-2 pr-14 font-[inherit] text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label={active ? "Stop agent output" : "Send message"}
          title={active ? "Stop" : "Send"}
          className={`absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full border text-white shadow-sm transition enabled:cursor-pointer disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 disabled:shadow-none ${
            active
              ? "border-red-500 bg-red-600 enabled:hover:bg-red-500"
              : "border-sky-500 bg-sky-600 enabled:hover:bg-sky-500"
          }`}
        >
          <span aria-hidden className="text-base leading-none">
            {active ? "■" : "↑"}
          </span>
        </button>
      </div>
    </form>
  );
}

export function ReviewPromptInput({
  targetLabel,
  itemCount,
  currentIndex,
  pendingCount,
  acceptLabel,
  denyLabel,
  active = false,
  disabled = false,
  onAccept,
  onDeny,
  onNavigate,
  onSubmit,
}: ReviewPromptInputProps) {
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"actions" | ReviewPromptKind>("actions");

  const submit = () => {
    const trimmed = message.trim();
    if (!trimmed || disabled || active || mode === "actions") {
      return;
    }
    onSubmit?.(mode, trimmed);
    setMessage("");
    setMode("actions");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      setMessage("");
      setMode("actions");
      return;
    }
    if (
      event.key === "Enter" &&
      !event.shiftKey &&
      (event.metaKey || event.ctrlKey)
    ) {
      event.preventDefault();
      submit();
    }
  };

  const safeItemCount = Math.max(itemCount, 1);
  const safeIndex = Math.min(Math.max(currentIndex, 0), safeItemCount - 1);
  const canSubmit = !disabled && !active && message.trim().length > 0;
  const canResolve = !disabled && !active;
  const canNavigate = !disabled && !active && safeItemCount > 1;
  const placeholder =
    mode === "ask"
      ? "Ask about the selected review item..."
      : "Guide the agent's approach...";
  const reviewNoun = acceptLabel.toLowerCase().includes("finding")
    ? "finding"
    : "change";

  return (
    <form
      onSubmit={handleSubmit}
      className="overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900 shadow-2xl shadow-black/30"
    >
      <div className="flex items-center gap-3 border-b border-neutral-800 bg-neutral-950/85 px-4 py-3">
        <div className="h-2 w-2 shrink-0 animate-pulse rounded-full bg-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.14)]" />
        <p className="m-0 text-sm font-medium text-neutral-100">
          Decision required: review this {reviewNoun} before continuing.
        </p>
      </div>

      <div className="p-4">
        {mode === "actions" ? (
          <>
            <div className="mb-4 flex min-w-0 flex-wrap items-center gap-3">
              <span className="text-sm text-neutral-400">
                {safeIndex + 1} of {safeItemCount} items
              </span>
              <span className="text-neutral-600">·</span>
              <span className="text-sm text-neutral-400">{pendingCount} pending</span>
              <span className="hidden text-neutral-600 sm:inline">·</span>
              <span
                className="hidden min-w-0 truncate font-mono text-xs text-neutral-500 sm:inline"
                title={targetLabel}
              >
                {targetLabel}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={onAccept}
                disabled={!canResolve}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-emerald-500 bg-emerald-600 px-3 text-sm font-semibold text-white shadow-sm transition enabled:cursor-pointer enabled:hover:bg-emerald-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
              >
                <Check className="h-4 w-4" aria-hidden />
                {acceptLabel}
                <Kbd className="ml-1">Enter</Kbd>
              </button>
              <button
                type="button"
                onClick={onDeny}
                disabled={!canResolve}
                className="inline-flex h-9 items-center gap-2 rounded-md border border-neutral-700 bg-neutral-800 px-3 text-sm font-medium text-neutral-100 transition enabled:cursor-pointer enabled:hover:border-red-400 enabled:hover:text-red-200 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
              >
                <X className="h-4 w-4" aria-hidden />
                {denyLabel}
                <Kbd className="ml-1">D</Kbd>
              </button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMode("ask")}
                  disabled={disabled || active}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 text-xs font-medium text-neutral-200 transition enabled:cursor-pointer enabled:hover:border-sky-500/60 enabled:hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <MessageSquare className="h-3.5 w-3.5" aria-hidden />
                  Ask
                </button>
                <button
                  type="button"
                  onClick={() => setMode("steer")}
                  disabled={disabled || active}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-neutral-700 bg-neutral-950 px-2.5 text-xs font-medium text-neutral-200 transition enabled:cursor-pointer enabled:hover:border-orange-500/60 enabled:hover:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Navigation className="h-3.5 w-3.5" aria-hidden />
                  Steer
                </button>
              </div>

              <div className="flex items-center gap-2 text-xs text-neutral-500">
                <button
                  type="button"
                  onClick={() => onNavigate?.("prev")}
                  disabled={!canNavigate || safeIndex === 0}
                  aria-label="Previous review item"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-neutral-400 transition enabled:cursor-pointer enabled:hover:border-neutral-700 enabled:hover:bg-neutral-950 enabled:hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-700"
                >
                  <ChevronUp className="h-4 w-4" aria-hidden />
                </button>
                <button
                  type="button"
                  onClick={() => onNavigate?.("next")}
                  disabled={!canNavigate || safeIndex === safeItemCount - 1}
                  aria-label="Next review item"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-transparent text-neutral-400 transition enabled:cursor-pointer enabled:hover:border-neutral-700 enabled:hover:bg-neutral-950 enabled:hover:text-neutral-100 disabled:cursor-not-allowed disabled:text-neutral-700"
                >
                  <ChevronDown className="h-4 w-4" aria-hidden />
                </button>
                <span className="ml-1 flex items-center gap-1">
                  <Kbd>↑</Kbd>
                  <Kbd>↓</Kbd>
                  cycle
                </span>
              </div>
            </div>
          </>
        ) : (
          <div>
            <div className="mb-3 flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode("actions");
                  setMessage("");
                }}
                className="inline-flex h-7 items-center rounded-md px-2 text-neutral-400 transition enabled:cursor-pointer enabled:hover:bg-neutral-950 enabled:hover:text-neutral-100"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
              <span className="text-sm font-medium capitalize text-neutral-100">
                {mode}
              </span>
            </div>
            <div className="relative">
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
                disabled={disabled || active}
                rows={3}
                className="box-border min-h-20 w-full resize-none rounded-lg border border-neutral-800 bg-neutral-950/70 px-3 py-2 pr-14 text-sm leading-relaxed text-neutral-100 outline-none transition placeholder:text-neutral-500 focus:border-sky-500/70 focus:ring-2 focus:ring-sky-500/15 disabled:opacity-60"
              />
              <button
                type="submit"
                disabled={!canSubmit}
                aria-label="Send review message"
                title="Send"
                className="absolute bottom-3 right-3 inline-flex h-8 w-8 items-center justify-center rounded-full border border-sky-500 bg-sky-600 text-white shadow-sm transition enabled:cursor-pointer enabled:hover:bg-sky-500 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600"
              >
                <ArrowUp className="h-4 w-4" aria-hidden />
              </button>
            </div>
            <p className="m-0 mt-2 text-right text-[11px] text-neutral-500">
              <Kbd>⌘↵</Kbd> send
            </p>
          </div>
        )}
      </div>
    </form>
  );
}

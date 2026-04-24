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
  pendingCount: number;
  active?: boolean;
  disabled?: boolean;
  onSubmit?: (kind: ReviewPromptKind, message: string) => void;
};

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
      className="rounded-2xl border border-neutral-800 bg-neutral-950 p-2 shadow-xl shadow-black/20 transition focus-within:border-cyan-400 focus-within:ring-2 focus-within:ring-cyan-400/20"
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
              : "border-cyan-400 bg-cyan-500 enabled:hover:bg-cyan-400"
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
  pendingCount,
  active = false,
  disabled = false,
  onSubmit,
}: ReviewPromptInputProps) {
  const [value, setValue] = useState("");
  const [kind, setKind] = useState<ReviewPromptKind>("ask");

  const submit = () => {
    const trimmed = value.trim();
    if (!trimmed || disabled || active) {
      return;
    }
    onSubmit?.(kind, trimmed);
    setValue("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Tab" && event.shiftKey) {
      event.preventDefault();
      setKind((current) => (current === "ask" ? "steer" : "ask"));
      return;
    }
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

  const canSubmit = !disabled && !active && value.trim().length > 0;
  const placeholder =
    kind === "ask"
      ? "Ask about the selected review item…"
      : "Steer the selected review item…";

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-2xl border border-cyan-400/50 bg-neutral-950 p-2 shadow-xl shadow-black/20 transition focus-within:border-cyan-300 focus-within:ring-2 focus-within:ring-cyan-400/20"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="m-0 shrink-0 rounded-full border border-cyan-400/40 bg-cyan-400/10 px-2 py-0.5 text-[11px] font-medium text-cyan-100">
            Review
          </p>
          <p className="m-0 truncate font-mono text-[11px] text-neutral-300" title={targetLabel}>
            {targetLabel}
          </p>
        </div>
        <p className="m-0 text-[11px] text-neutral-400">
          {pendingCount} pending · <span className="font-mono">←/→</span>{" "}
          cycle · <span className="font-mono">⌘↵</span> accept ·{" "}
          <span className="font-mono">d</span> deny ·{" "}
          <span className="font-mono">⇧⇥</span> mode
        </p>
      </div>
      <div className="mb-2 flex gap-1 px-1">
        {(["ask", "steer"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setKind(option)}
            className={`rounded-md border px-2.5 py-1 text-xs font-medium capitalize ${
              kind === option
                ? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
                : "border-neutral-800 bg-black text-neutral-300 enabled:hover:bg-neutral-900"
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="relative">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled || active}
          rows={2}
          className="box-border max-h-40 min-h-16 w-full resize-none border-0 bg-transparent py-2 pl-2 pr-14 font-[inherit] text-sm leading-relaxed text-neutral-100 outline-none placeholder:text-neutral-600 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={!canSubmit}
          aria-label="Send review message"
          title="Send"
          className="absolute bottom-1.5 right-1.5 flex h-9 w-9 items-center justify-center rounded-full border border-cyan-400 bg-cyan-500 text-white shadow-sm transition enabled:cursor-pointer enabled:hover:bg-cyan-400 disabled:cursor-not-allowed disabled:border-neutral-800 disabled:bg-neutral-900 disabled:text-neutral-600 disabled:shadow-none"
        >
          <span aria-hidden className="text-base leading-none">
            ↑
          </span>
        </button>
      </div>
    </form>
  );
}

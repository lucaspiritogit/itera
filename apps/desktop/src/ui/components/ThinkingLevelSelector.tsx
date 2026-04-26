import { useState } from "react";
import type { ModelThinkingLevel } from "../../features/agent-session/agent-session/model-options";

function formatThinkingLevel(level: ModelThinkingLevel): string {
	return level.charAt(0).toUpperCase() + level.slice(1);
}

export function ThinkingLevelSelector({
	value,
	options,
	disabled,
	onChange,
}: {
	value: ModelThinkingLevel;
	options: readonly ModelThinkingLevel[];
	disabled: boolean;
	onChange: (value: ModelThinkingLevel) => void;
}) {
	const [open, setOpen] = useState(false);

	return (
		<div className="relative min-w-0">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex h-9 min-w-32 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 text-xs text-neutral-100 transition enabled:cursor-pointer enabled:hover:border-sky-500/70 disabled:opacity-60"
			>
				<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-100">
					T
				</span>
				<span className="truncate">{formatThinkingLevel(value)}</span>
				<span className="ml-auto text-neutral-500" aria-hidden>
					^
				</span>
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-40 rounded-md border border-neutral-800 bg-black p-1 shadow-xl shadow-black/40"
				>
					{options.map((option) => (
						<button
							key={option}
							type="button"
							role="option"
							aria-selected={option === value}
							onClick={() => {
								onChange(option);
								setOpen(false);
							}}
							className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs enabled:cursor-pointer enabled:hover:bg-neutral-900 ${option === value ? "text-sky-100" : "text-neutral-300"
								}`}
						>
							<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-100">
								T
							</span>
							<span>{formatThinkingLevel(option)}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

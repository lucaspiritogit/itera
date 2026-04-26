import { useState } from "react";
import type {
	ModelId,
	ModelOption,
} from "../../features/agent-session/agent-session/model-options";

export function ModelSelector({
	value,
	options,
	disabled,
	onChange,
}: {
	value: ModelId;
	options: readonly ModelOption[];
	disabled: boolean;
	onChange: (value: ModelId) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected = options.find((option) => option.id === value) ?? options[0];

	if (!selected) {
		return null;
	}

	return (
		<div className="relative min-w-0">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex h-9 min-w-44 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 text-xs text-neutral-100 transition enabled:cursor-pointer enabled:hover:border-sky-500/70 disabled:opacity-60"
			>
				<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-100">
					M
				</span>
				<span className="truncate">{selected.label}</span>
				<span className="ml-auto text-neutral-500" aria-hidden>
					^
				</span>
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-52 rounded-md border border-neutral-800 bg-black p-1 shadow-xl shadow-black/40"
				>
					{options.map((option) => (
						<button
							key={option.id}
							type="button"
							role="option"
							aria-selected={option.id === value}
							onClick={() => {
								onChange(option.id);
								setOpen(false);
							}}
							className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs enabled:cursor-pointer enabled:hover:bg-neutral-900 ${option.id === value ? "text-sky-100" : "text-neutral-300"
								}`}
						>
							<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-sky-500/40 bg-sky-500/10 text-[10px] text-sky-100">
								M
							</span>
							<span className="truncate">{option.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

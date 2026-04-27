import { ChevronUp, Cpu } from "lucide-react";
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
				className="flex h-9 min-w-44 items-center gap-2 rounded-md border border-stone-700/80 bg-stone-950/90 px-2.5 text-xs text-stone-100 shadow-sm shadow-black/20 transition enabled:cursor-pointer enabled:hover:border-amber-400/70 enabled:hover:bg-stone-900 disabled:opacity-60"
			>
				<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-amber-400/40 bg-amber-400/10 text-amber-100">
					<Cpu className="h-3.5 w-3.5" aria-hidden />
				</span>
				<span className="truncate">{selected.label}</span>
				<ChevronUp className="ml-auto h-3.5 w-3.5 text-stone-500" aria-hidden />
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-52 rounded-md border border-stone-700/80 bg-stone-950 p-1 shadow-xl shadow-black/45"
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
							className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs enabled:cursor-pointer enabled:hover:bg-stone-900 ${option.id === value ? "text-amber-100" : "text-stone-300"
								}`}
						>
							<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-amber-400/40 bg-amber-400/10 text-amber-100">
								<Cpu className="h-3.5 w-3.5" aria-hidden />
							</span>
							<span className="truncate">{option.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

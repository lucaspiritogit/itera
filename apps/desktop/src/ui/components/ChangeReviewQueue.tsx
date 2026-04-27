import {
	FileDiff,
	WorkerPoolContextProvider,
	// eslint-disable-next-line import/no-unresolved
} from "@pierre/diffs/react";
// eslint-disable-next-line import/no-unresolved
import PierreDiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useMemo } from "react";
import type { ReviewDecision } from "../../features/agent-session/model/reviewDecision";
import type { ReviewCard } from "../../features/review/reviewDiff";

const DIFF_OPTIONS = {
	theme: "pierre-dark" as const,
	overflow: "scroll" as const,
};

export type ReviewDiffStyle = "unified" | "split";

export type ChangeReviewQueueProps = {
	cards: ReviewCard[];
	decisions: Record<string, ReviewDecision>;
	activeIndex: number;
	onSelect: (index: number) => void;
	diffStyle: ReviewDiffStyle;
};

function decisionPillClass(decision: ReviewDecision): string {
	if (decision === "accepted") {
		return "border-emerald-500/40 bg-emerald-500/10 text-emerald-200";
	}
	if (decision === "denied") {
		return "border-red-500/40 bg-red-500/10 text-red-200";
	}
	return "border-amber-400/60 bg-amber-400/15 text-amber-100";
}

export function ChangeReviewQueue({
	cards,
	decisions,
	activeIndex,
	onSelect,
	diffStyle,
}: ChangeReviewQueueProps) {
	const poolOptions = useMemo(
		() => ({
			workerFactory: () => new PierreDiffsWorker(),
			poolSize: 4,
		}),
		[],
	);
	const highlighterOptions = useMemo(
		() => ({
			theme: DIFF_OPTIONS.theme,
		}),
		[],
	);

	if (cards.length === 0) {
		return null;
	}

	const safeIndex = Math.min(Math.max(activeIndex, 0), cards.length - 1);
	const selected = cards[safeIndex];
	const pendingCount = cards.reduce(
		(count, c) => count + (decisions[c.id] === "pending" ? 1 : 0),
		0,
	);
	const selectedDecision = decisions[selected.id] ?? "pending";

	return (
		<article className="flex w-full max-w-5xl flex-col gap-4 rounded-xl border border-stone-700/80 bg-stone-900/95 px-4 py-4 shadow-2xl shadow-black/35">
			<header className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-amber-300">
						Review required
					</p>
					<p className="m-0 mt-0.5 text-base font-semibold text-stone-100">
						{cards.length} file changes pending decision
					</p>
					<p className="m-0 mt-1 text-[11px] leading-relaxed text-stone-400">
						Keys: <span className="font-mono">←/→</span> navigate,{" "}
						<span className="font-mono">⌘↵</span> accept,{" "}
						<span className="font-mono">d</span> deny,{" "}
						<span className="font-mono">v</span> view.
					</p>
				</div>
				<p
					className={`m-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${decisionPillClass(
						selectedDecision,
					)}`}
				>
					{pendingCount} pending
				</p>
			</header>

			<div className="flex flex-wrap gap-2">
				{cards.map((card, i) => {
					const decision = decisions[card.id] ?? "pending";
					const isActive = i === safeIndex;
					return (
						<button
							key={card.id}
							type="button"
							onClick={() => onSelect(i)}
							className={`rounded-md border px-2.5 py-1 text-left text-xs transition ${
								isActive
									? "border-amber-400/70 bg-amber-400/10 text-amber-100"
									: "border-stone-800 bg-stone-950 text-stone-300 hover:border-stone-700 hover:bg-stone-900"
							}`}
							title={card.filePath}
						>
							<span className="font-mono">{card.filePath}</span>{" "}
							<span className="opacity-80">[{decision}]</span>
						</button>
					);
				})}
			</div>

			<section className="flex flex-col gap-3 rounded-lg border border-stone-700/70 bg-stone-950 p-3 shadow-inner shadow-black/25">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
							Selected change
						</p>
						<p className="m-0 mt-0.5 break-all font-mono text-sm text-stone-100">
							{selected.filePath}
						</p>
					</div>
				</div>

				{selectedDecision !== "pending" ? (
					<p className="m-0 rounded-md border border-stone-800 bg-stone-950 px-3 py-2 text-xs text-stone-300">
						This change is {selectedDecision}.
					</p>
				) : selected.kind === "file" ? (
					<WorkerPoolContextProvider
						poolOptions={poolOptions}
						highlighterOptions={highlighterOptions}
					>
						<FileDiff
							fileDiff={selected.fileDiff}
							options={{ ...DIFF_OPTIONS, diffStyle }}
							className="w-full max-w-full rounded-lg border border-stone-700/70"
							style={{ minHeight: "8rem" }}
						/>
					</WorkerPoolContextProvider>
				) : (
					<pre className="max-h-[min(30rem,55vh)] overflow-auto rounded-lg border border-stone-700/70 bg-stone-950 p-3 font-mono text-xs leading-relaxed text-stone-200">
						{selected.rawPatch}
					</pre>
				)}
			</section>
		</article>
	);
}

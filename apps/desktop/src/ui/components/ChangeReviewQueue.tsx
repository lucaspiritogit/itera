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
	return "border-cyan-400/40 bg-cyan-400/10 text-cyan-200";
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
		<article className="flex w-full max-w-5xl flex-col gap-4 rounded-2xl border border-neutral-800 bg-black px-4 py-4 shadow-xl shadow-black/20">
			<header className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-cyan-300">
						Review required
					</p>
					<p className="m-0 mt-0.5 text-sm text-neutral-100">
						{cards.length} file changes pending decision
					</p>
					<p className="m-0 mt-1 text-[11px] text-neutral-400">
						Keys: <span className="font-mono">←/→</span> navigate,{" "}
						<span className="font-mono">⌘↵</span> accept,{" "}
						<span className="font-mono">d</span> deny,{" "}
						<span className="font-mono">v</span> view.
					</p>
				</div>
				<p
					className={`m-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${decisionPillClass(
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
								className={`rounded-md border px-2.5 py-1 text-left text-xs ${
								isActive
									? "border-cyan-400 bg-cyan-400/15 text-cyan-100"
									: "border-neutral-800 bg-neutral-950 text-neutral-300 hover:bg-neutral-900"
							}`}
							title={card.filePath}
						>
							<span className="font-mono">{card.filePath}</span>{" "}
							<span className="opacity-80">[{decision}]</span>
						</button>
					);
				})}
			</div>

			<section className="flex flex-col gap-3 rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<div>
						<p className="m-0 text-[10px] font-semibold uppercase tracking-wide text-neutral-400">
							Selected change
						</p>
						<p className="m-0 mt-0.5 break-all font-mono text-sm text-neutral-100">
							{selected.filePath}
						</p>
					</div>
				</div>

				{selectedDecision !== "pending" ? (
					<p className="m-0 rounded-md border border-neutral-800 bg-black px-3 py-2 text-xs text-neutral-300">
						This change is {selectedDecision}.
					</p>
				) : selected.kind === "file" ? (
					<>
						<div className="grid gap-2 sm:grid-cols-3">
							<p className="m-0 rounded-md border border-neutral-800 bg-black px-2 py-1 text-xs text-neutral-300">
								Hunks: {selected.hunks.length}
							</p>
							<p className="m-0 rounded-md border border-neutral-800 bg-black px-2 py-1 text-xs text-emerald-300">
								+{selected.added} additions
							</p>
							<p className="m-0 rounded-md border border-neutral-800 bg-black px-2 py-1 text-xs text-red-300">
								-{selected.removed} deletions
							</p>
						</div>
						<div className="grid gap-2">
							{selected.hunks.map((hunk) => (
								<div
									key={hunk.id}
									className="rounded-md border border-neutral-800 bg-black px-2 py-1.5"
								>
									<p className="m-0 break-all font-mono text-[11px] text-neutral-200">
										{hunk.label}
									</p>
									<p className="m-0 mt-0.5 text-[11px] text-neutral-400">
										+{hunk.added} / -{hunk.removed}
									</p>
								</div>
							))}
						</div>
						<WorkerPoolContextProvider
							poolOptions={poolOptions}
							highlighterOptions={highlighterOptions}
						>
							<FileDiff
								fileDiff={selected.fileDiff}
								options={{ ...DIFF_OPTIONS, diffStyle }}
								className="w-full max-w-full rounded-xl border border-neutral-800"
								style={{ minHeight: "8rem" }}
							/>
						</WorkerPoolContextProvider>
					</>
				) : (
					<pre className="max-h-[min(30rem,55vh)] overflow-auto rounded-lg border border-neutral-800 bg-black p-3 font-mono text-xs leading-relaxed text-neutral-200">
						{selected.rawPatch}
					</pre>
				)}
			</section>
		</article>
	);
}

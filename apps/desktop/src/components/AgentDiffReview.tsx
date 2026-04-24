// eslint-disable-next-line import/no-unresolved
import { parsePatchFiles } from "@pierre/diffs";
import {
	FileDiff,
	type FileDiffMetadata,
	WorkerPoolContextProvider,
	// eslint-disable-next-line import/no-unresolved
} from "@pierre/diffs/react";
// eslint-disable-next-line import/no-unresolved
import PierreDiffsWorker from "@pierre/diffs/worker/worker.js?worker";
import { useMemo } from "react";

const DIFF_OPTIONS = {
	theme: "pierre-dark" as const,
	overflow: "scroll" as const,
};

export type AgentDiffReviewProps = {
	patch: string | null;
	cacheKeyPrefix?: string;
	diffStyle?: "unified" | "split";
};

function patchMetadataLineBoundsValid(f: FileDiffMetadata): boolean {
	return !f.hunks.some(
		(h) =>
			h.deletionLineIndex + h.deletionCount > f.deletionLines.length ||
			h.additionLineIndex + h.additionCount > f.additionLines.length,
	);
}

export function AgentDiffReview({
	patch,
	cacheKeyPrefix = "codex",
	diffStyle = "unified",
}: AgentDiffReviewProps) {
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

	const { files, renderAsRaw } = useMemo(() => {
		if (!patch || !patch.trim()) {
			return { files: [] as FileDiffMetadata[], renderAsRaw: false };
		}
		try {
			const patches = parsePatchFiles(patch, cacheKeyPrefix, false);
			const files = patches.flatMap((p) => p.files);
			const lineBoundsInvalid = files.some(
				(f) => !patchMetadataLineBoundsValid(f),
			);
			return { files, renderAsRaw: files.length === 0 || lineBoundsInvalid };
		} catch {
			return { files: [] as FileDiffMetadata[], renderAsRaw: true };
		}
	}, [patch, cacheKeyPrefix]);

	if (!patch || !patch.trim()) {
		return (
			<div className="flex min-h-[12rem] items-center justify-center rounded-xl border border-dashed border-neutral-800 bg-neutral-950 px-6 py-10 text-center text-sm text-neutral-400">
				No code changes in this session yet.
			</div>
		);
	}

	if (renderAsRaw) {
		return (
			<pre className="max-h-[min(32rem,55vh)] overflow-auto rounded-xl border border-neutral-800 bg-black p-4 font-mono text-xs leading-relaxed text-neutral-200">
				{patch}
			</pre>
		);
	}

	return (
		<WorkerPoolContextProvider
			poolOptions={poolOptions}
			highlighterOptions={highlighterOptions}
		>
			<div className="flex w-full flex-col gap-6">
				{files.map((fd, i) => (
					<FileDiff
						key={fd.cacheKey ?? `${fd.name}-${i}`}
						fileDiff={fd}
						options={{ ...DIFF_OPTIONS, diffStyle }}
						className="w-full max-w-full rounded-xl border border-neutral-800 shadow-xl shadow-black/20"
						style={{ minHeight: "8rem" }}
					/>
				))}
			</div>
		</WorkerPoolContextProvider>
	);
}

// eslint-disable-next-line import/no-unresolved
import { parsePatchFiles } from "@pierre/diffs";
import type { FileDiffMetadata } from "@pierre/diffs/react";

export type ReviewCard =
	| {
			id: string;
			kind: "file";
			filePath: string;
			fileDiff: FileDiffMetadata;
		}
	| {
			id: string;
			kind: "raw";
			filePath: "Raw patch";
			rawPatch: string;
		};

type ReviewLineRange = {
	filePath: string;
	deletionStart: number;
	deletionEnd: number;
	additionStart: number;
	additionEnd: number;
};

function patchMetadataLineBoundsValid(f: FileDiffMetadata): boolean {
	return !f.hunks.some(
		(h) =>
			h.deletionLineIndex + h.deletionCount > f.deletionLines.length ||
			h.additionLineIndex + h.additionCount > f.additionLines.length,
	);
}

function asRawCard(patch: string, cacheKeyPrefix: string): ReviewCard[] {
		return [
		{
			id: `${cacheKeyPrefix}-raw`,
			kind: "raw",
			filePath: "Raw patch",
			rawPatch: patch,
		},
	];
}

function endLine(start: number, count: number): number {
	return Math.max(start, start + Math.max(count, 1) - 1);
}

function rangesOverlap(
	aStart: number,
	aEnd: number,
	bStart: number,
	bEnd: number,
): boolean {
	return aStart <= bEnd && bStart <= aEnd;
}

export function reviewCardLineRanges(card: ReviewCard): ReviewLineRange[] {
	if (card.kind !== "file") {
		return [];
	}
	return card.fileDiff.hunks.map((hunk) => ({
		filePath: card.filePath,
		deletionStart: hunk.deletionStart,
		deletionEnd: endLine(hunk.deletionStart, hunk.deletionCount),
		additionStart: hunk.additionStart,
		additionEnd: endLine(hunk.additionStart, hunk.additionCount),
	}));
}

export function reviewCardsOverlap(a: ReviewCard, b: ReviewCard): boolean {
	const aRanges = reviewCardLineRanges(a);
	const bRanges = reviewCardLineRanges(b);
	return aRanges.some((ar) =>
		bRanges.some(
			(br) =>
				ar.filePath === br.filePath &&
				(rangesOverlap(
					ar.deletionStart,
					ar.deletionEnd,
					br.deletionStart,
					br.deletionEnd,
				) ||
					rangesOverlap(
						ar.additionStart,
						ar.additionEnd,
						br.additionStart,
						br.additionEnd,
					)),
		),
	);
}

export function compactOverlappingReviewCards(cards: ReviewCard[]): ReviewCard[] {
	return cards.filter(
		(card, index) =>
			!cards.some(
				(candidate, candidateIndex) =>
					candidateIndex > index && reviewCardsOverlap(card, candidate),
			),
	);
}

export function parseReviewCardsFromPatch(
	patch: string,
	cacheKeyPrefix: string,
): ReviewCard[] {
	const trimmed = patch.trim();
	if (!trimmed) {
		return [];
	}
	try {
		const parsed = parsePatchFiles(trimmed, cacheKeyPrefix, false);
		const files = parsed.flatMap((p) => p.files);
		if (files.length === 0) {
			return asRawCard(trimmed, cacheKeyPrefix);
		}
		if (files.some((f) => !patchMetadataLineBoundsValid(f))) {
			return asRawCard(trimmed, cacheKeyPrefix);
		}
		return compactOverlappingReviewCards(
			files.map((f, i) => ({
				id: f.cacheKey ?? `${cacheKeyPrefix}-${f.name}-${i}`,
				kind: "file" as const,
				filePath: f.name,
				fileDiff: f,
			})),
		);
	} catch {
		return asRawCard(trimmed, cacheKeyPrefix);
	}
}

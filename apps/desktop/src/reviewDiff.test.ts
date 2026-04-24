import { describe, expect, it } from "vitest";
import {
	compactOverlappingReviewCards,
	parseReviewCardsFromPatch,
} from "./reviewDiff";

const firstRandomChangePatch = `diff --git a/src/random-change.ts b/src/random-change.ts
index 1111111..2222222 100644
--- a/src/random-change.ts
+++ b/src/random-change.ts
@@ -59,4 +59,4 @@
 return \`#\${index + 1}: \${phrase}\`
 }
 
-const hello = 'this is a slightly less random code change'
+export const hello = 'this is a slightly less random code change'`;

const laterRandomChangePatch = `diff --git a/src/random-change.ts b/src/random-change.ts
index 2222222..3333333 100644
--- a/src/random-change.ts
+++ b/src/random-change.ts
@@ -59,4 +59,4 @@
 return \`#\${index + 1}: \${phrase}\`
 }
 
-export const hello = 'this is a slightly less random code change'
+export const hello = 'this is a slightly more random code change'`;

const separateFooterPatch = `diff --git a/src/random-change.ts b/src/random-change.ts
index 4444444..5555555 100644
--- a/src/random-change.ts
+++ b/src/random-change.ts
@@ -120,3 +120,4 @@
 export function footer() {
   return "done";
 }
+export const footerEnabled = true;`;

describe("review diff cards", () => {
	it("keeps the latest review when a later change touches the same file line", () => {
		const cards = compactOverlappingReviewCards([
			...parseReviewCardsFromPatch(firstRandomChangePatch, "first"),
			...parseReviewCardsFromPatch(laterRandomChangePatch, "later"),
		]);

		expect(cards).toHaveLength(1);
		expect(cards[0].filePath).toBe("src/random-change.ts");
		expect(cards[0].hunks).toHaveLength(1);
		expect(cards[0].hunks[0].label).toContain("@@ -59,4 +59,4 @@");
		expect(cards[0].added).toBe(1);
		expect(cards[0].removed).toBe(1);
	});

	it("keeps separate review cards when changes touch different lines in the same file", () => {
		const cards = compactOverlappingReviewCards([
			...parseReviewCardsFromPatch(laterRandomChangePatch, "line-62"),
			...parseReviewCardsFromPatch(separateFooterPatch, "footer"),
		]);

		expect(cards).toHaveLength(2);
		expect(cards.map((card) => card.filePath)).toEqual([
			"src/random-change.ts",
			"src/random-change.ts",
		]);
		expect(cards.map((card) => card.hunks[0].label.trim())).toEqual([
			"@@ -59,4 +59,4 @@",
			"@@ -120,3 +120,4 @@",
		]);
	});
});

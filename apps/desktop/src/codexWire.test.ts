import { describe, expect, it } from "vitest";
import {
	extractFinding,
	handleCodexRpcLine,
	type CodexTurnContext,
} from "./codexWire";

function createTurnContext(): CodexTurnContext {
	return {
		finalAgentText: "",
		reviewFragments: [],
		lastTurnDiff: "",
	};
}

describe("Codex wire review flow", () => {
	it("extracts exploration findings with code excerpts", () => {
		expect(
			extractFinding(
				'{"file":"src/app.ts","startLine":10,"endLine":20,"reason":"Important component.","code":"export function App() {}"}',
			),
		).toEqual({
			file: "src/app.ts",
			startLine: 10,
			endLine: 20,
			reason: "Important component.",
			code: "export function App() {}",
		});
	});

	it("returns the final turn diff instead of stale file-change fragments", () => {
		const ctx = createTurnContext();

		handleCodexRpcLine({ method: "turn/started" }, ctx);
		handleCodexRpcLine(
			{
				method: "item/completed",
				params: {
					item: {
						type: "fileChange",
						changes: [{ diff: "intermediate patch" }],
					},
				},
			},
			ctx,
		);
		handleCodexRpcLine(
			{
				method: "turn/diff/updated",
				params: { diff: "final patch" },
			},
			ctx,
		);

		const result = handleCodexRpcLine(
			{
				method: "turn/completed",
				params: { turn: { status: "completed" } },
			},
			ctx,
		);

		expect(result.reviewPatch).toBe("final patch");
		expect(ctx.reviewFragments).toEqual([]);
		expect(ctx.lastTurnDiff).toBe("");
	});

	it("falls back to completed file-change fragments when no turn diff arrives", () => {
		const ctx = createTurnContext();

		handleCodexRpcLine({ method: "turn/started" }, ctx);
		handleCodexRpcLine(
			{
				method: "item/completed",
				params: {
					item: {
						type: "fileChange",
						changes: [{ diff: "only file-change patch" }],
					},
				},
			},
			ctx,
		);

		const result = handleCodexRpcLine(
			{
				method: "turn/completed",
				params: { turn: { status: "completed" } },
			},
			ctx,
		);

		expect(result.reviewPatch).toBe("only file-change patch");
		expect(ctx.reviewFragments).toEqual([]);
		expect(ctx.lastTurnDiff).toBe("");
	});
});

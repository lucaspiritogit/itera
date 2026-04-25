import { describe, expect, it } from "vitest";
import type { RpcHandlerResult } from "../../../integrations/codex/codexWire";
import {
	compactOverlappingReviewCards,
	parseReviewCardsFromPatch,
} from "../../../features/review/reviewDiff";
import { createAgentSessionOrchestrator } from "./orchestrator";
import type {
	AgentSessionPorts,
	AgentWireConnection,
} from "./types";

const reviewPatch = `diff --git a/src/random-change.ts b/src/random-change.ts
index 1111111..2222222 100644
--- a/src/random-change.ts
+++ b/src/random-change.ts
@@ -1,1 +1,1 @@
-const value = "old"
+const value = "new"`;

const explorationFinding = {
	file: "src/app.ts",
	reason: "central file",
	code: "export function App() {}",
	startLine: 1,
	endLine: 1,
};

class FakeConnection implements AgentWireConnection {
	sent: string[] = [];
	private open: (() => void) | null = null;
	private message: ((raw: string) => void) | null = null;
	private error: ((error?: unknown) => void) | null = null;
	private closeHandler: (() => void) | null = null;

	send(raw: string): void {
		this.sent.push(raw);
	}

	close(): void {
		this.closeHandler?.();
	}

	onOpen(cb: () => void): void {
		this.open = cb;
	}

	onMessage(cb: (raw: string) => void): void {
		this.message = cb;
	}

	onError(cb: (error?: unknown) => void): void {
		this.error = cb;
	}

	onClose(cb: () => void): void {
		this.closeHandler = cb;
	}

	emitOpen(): void {
		this.open?.();
	}

	emitMessage(raw: string): void {
		this.message?.(raw);
	}

	emitError(error?: unknown): void {
		this.error?.(error);
	}
}

function createHarness({
	rpcResults = [],
}: {
	rpcResults?: RpcHandlerResult[];
} = {}) {
	const connection = new FakeConnection();
	let id = 0;
	const ports: AgentSessionPorts = {
		transport: {
			connect: () => connection,
		},
		wireCodec: {
			parseInbound(raw) {
				return JSON.parse(raw);
			},
			encodeUserText(text) {
				return JSON.stringify({ op: "userText", text });
			},
			encodeReadFile(path, requestId) {
				return JSON.stringify({ op: "readFile", path, requestId });
			},
			encodeRawRpc(line) {
				return JSON.stringify({ op: "rpc", line });
			},
			encodeStopTurn() {
				return JSON.stringify({ op: "stop" });
			},
		},
		rpcReducer: {
			apply() {
				return rpcResults.shift() ?? {};
			},
		},
		reviewParser: {
			parsePatch: parseReviewCardsFromPatch,
			compact: compactOverlappingReviewCards,
		},
		promptPolicy: {
			buildInitialPrompt({ mode, userText }) {
				return mode === "editing" ? userText : `explore:${userText}`;
			},
			buildFollowupPrompt({ userText, finding }) {
				return `edit:${userText}:${finding.file}:${finding.code}`;
			},
		},
		id: {
			next(prefix) {
				id += 1;
				return `${prefix}-${id}`;
			},
		},
	};
	const session = createAgentSessionOrchestrator({
		ports,
		initial: { cwd: "/repo", mode: "exploration" },
	});
	return { connection, session };
}

describe("AgentSessionOrchestrator", () => {
	it("sends exploration prompts through the transport and gates while active", () => {
		const { connection, session } = createHarness();

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("make a change");

		expect(session.getSnapshot().canSend).toBe(false);
		expect(session.getSnapshot().hasActiveTurn).toBe(true);
		expect(connection.sent).toContain(
			JSON.stringify({ op: "userText", text: "explore:make a change" }),
		);
		expect(session.getSnapshot().chatItems).toEqual([
			{ id: "user-1", type: "user", text: "make a change" },
		]);
	});

	it("sends stop requests and clears the active turn locally", () => {
		const { connection, session } = createHarness();

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("make a change");
		session.stopTurn();

		expect(connection.sent).toContain(JSON.stringify({ op: "stop" }));
		expect(session.getSnapshot().hasActiveTurn).toBe(false);
		expect(session.getSnapshot().systemMessages.at(-1)?.text).toBe(
			"Stop requested.",
		);
	});

	it("holds exploration findings until the user marks them reviewed", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					finding: explorationFinding,
					appendAssistant:
						'{"file":"src/app.ts","reason":"central file","code":"export function App() {}","startLine":1,"endLine":1}',
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("make a change");
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		expect(session.getSnapshot().mode).toBe("editing");
		expect(session.getSnapshot().findingResolved).toBe(false);
		expect(session.getSnapshot().pendingExplorationDecision).toBe(true);
		expect(connection.sent).not.toContain(
			JSON.stringify({
				op: "userText",
				text: "make a change",
			}),
		);

		session.resolveFinding("approve");

		expect(session.getSnapshot().findingResolved).toBe(true);
		expect(session.getSnapshot().pendingExplorationDecision).toBe(false);
		expect(connection.sent).toContain(
			JSON.stringify({
				op: "userText",
				text: "edit:make a change:src/app.ts:export function App() {}",
			}),
		);
		expect(session.getSnapshot().systemMessages.at(-1)?.text).toBe(
			"Exploration reviewed. Starting edit flow.",
		);
	});

	it("sends review questions for exploration findings without resolving them", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					finding: explorationFinding,
					appendAssistant:
						'{"file":"src/app.ts","reason":"central file","code":"export function App() {}","startLine":1,"endLine":1}',
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("make a change");
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		session.sendReviewText("ask", "why this file?");

		expect(session.getSnapshot().pendingExplorationDecision).toBe(true);
		expect(session.getSnapshot().findingResolved).toBe(false);
		expect(connection.sent.at(-1)).toContain("why this file?");
		expect(connection.sent.at(-1)).toContain("Review target: exploration finding");
	});

	it("records plain review answers without resolving the pending item", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					reviewPatch,
					appendAssistant: "done",
					clearProcessStep: true,
				},
				{
					appendAssistant: "Because this file owns the random phrase list.",
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("change it", { mode: "editing" });
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));
		session.sendReviewText("ask", "why this file?");
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		expect(session.getSnapshot().pendingReviewDecision).toBe(true);
		expect(session.getSnapshot().chatItems.at(-1)).toEqual({
			id: "assistant-5",
			type: "assistant",
			text: "Because this file owns the random phrase list.",
		});
	});

	it("creates review batches and resolves review decisions at the boundary", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					reviewPatch,
					appendAssistant: "done",
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("change it", { mode: "editing" });
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		const batch = session.getSnapshot().reviewBatch;
		expect(batch?.cards).toHaveLength(1);
		expect(session.getSnapshot().pendingReviewDecision).toBe(true);
		expect(session.getSnapshot().canSend).toBe(false);

		session.setReviewDecision(batch?.cards[0].id ?? "", "accepted");

		expect(session.getSnapshot().pendingReviewDecision).toBe(false);
		expect(session.getSnapshot().canSend).toBe(true);
		expect(session.getSnapshot().systemMessages.at(-1)?.text).toBe(
			"Review resolved: 1 accepted, 0 denied.",
		);
	});

	it("starts a fresh exploration after a change review is accepted", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					reviewPatch,
					appendAssistant: "done",
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("change it", { mode: "editing" });
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		const batch = session.getSnapshot().reviewBatch;
		session.setReviewDecision(batch?.cards[0].id ?? "", "accepted");
		session.sendUserText("make another change");

		expect(connection.sent.at(-1)).toBe(
			JSON.stringify({ op: "userText", text: "explore:make another change" }),
		);
		expect(session.getSnapshot().mode).toBe("exploration");
	});

	it("sends review steering for selected changes without resolving them", () => {
		const { connection, session } = createHarness({
			rpcResults: [
				{
					reviewPatch,
					appendAssistant: "done",
					clearProcessStep: true,
				},
			],
		});

		session.connect({ cwd: "/repo" });
		connection.emitMessage(
			JSON.stringify([
				{ type: "backend.ready", threadId: "thread-1", cwd: "/repo", model: "m" },
			]),
		);
		session.sendUserText("change it", { mode: "editing" });
		connection.emitMessage(JSON.stringify([{ type: "codex.rpc", payload: {} }]));

		session.sendReviewText("steer", "keep the old name");

		expect(session.getSnapshot().pendingReviewDecision).toBe(true);
		expect(session.getSnapshot().pendingReviewCount).toBe(1);
		expect(connection.sent.at(-1)).toContain("keep the old name");
		expect(connection.sent.at(-1)).toContain("Review target: selected file change");
	});
});

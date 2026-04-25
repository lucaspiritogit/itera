import { describe, expect, it } from "vitest";
import {
	createDefaultSessionShortcutPolicy,
	createSessionShortcutController,
	type SessionGateState,
	type SessionKeyEvent,
	type SessionRuntimeCommand,
} from "./sessionShortcutPolicy";

function event(input: Partial<SessionKeyEvent>): SessionKeyEvent {
	return {
		key: "x",
		metaKey: false,
		ctrlKey: false,
		targetIsEditable: false,
		...input,
	};
}

function gate(input: Partial<SessionGateState>): SessionGateState {
	return {
		hasActiveTurn: false,
		pendingExplorationDecision: false,
		hasReviewCards: false,
		activeReviewCardId: undefined,
		...input,
	};
}

describe("session shortcut policy", () => {
	it("maps review shortcuts to review commands", () => {
		const policy = createDefaultSessionShortcutPolicy();
		const currentGate = gate({
			hasReviewCards: true,
			activeReviewCardId: "card-1",
		});

		expect(policy.decide({ event: event({ key: "ArrowRight" }), gate: currentGate })).toEqual(
			{
				kind: "handled",
				commands: [{ type: "review.move", delta: 1 }],
			},
		);
		expect(policy.decide({ event: event({ key: "ArrowLeft" }), gate: currentGate })).toEqual({
			kind: "handled",
			commands: [{ type: "review.move", delta: -1 }],
		});
		expect(
			policy.decide({
				event: event({ key: "Enter", metaKey: true }),
				gate: currentGate,
			}),
		).toEqual({
			kind: "handled",
			commands: [
				{ type: "review.setDecision", cardId: "card-1", decision: "accepted" },
			],
		});
		expect(policy.decide({ event: event({ key: "d" }), gate: currentGate })).toEqual({
			kind: "handled",
			commands: [
				{ type: "review.setDecision", cardId: "card-1", decision: "denied" },
			],
		});
	});

	it("maps exploration shortcuts and active-turn stop", () => {
		const policy = createDefaultSessionShortcutPolicy();

		expect(
			policy.decide({
				event: event({ key: "Enter", ctrlKey: true }),
				gate: gate({ pendingExplorationDecision: true }),
			}),
		).toEqual({
			kind: "handled",
			commands: [{ type: "finding.resolve", action: "approve" }],
		});

		expect(
			policy.decide({
				event: event({ key: "d" }),
				gate: gate({ pendingExplorationDecision: true }),
			}),
		).toEqual({
			kind: "handled",
			commands: [{ type: "finding.resolve", action: "dismiss" }],
		});

		expect(
			policy.decide({
				event: event({ key: "Escape" }),
				gate: gate({ hasActiveTurn: true }),
			}),
		).toEqual({
			kind: "handled",
			commands: [{ type: "turn.stop" }],
		});
	});

	it("blocks editable targets except accept shortcut", () => {
		const policy = createDefaultSessionShortcutPolicy();
		const currentGate = gate({
			hasReviewCards: true,
			activeReviewCardId: "card-1",
		});

		expect(
			policy.decide({
				event: event({ key: "d", targetIsEditable: true }),
				gate: currentGate,
			}),
		).toEqual({ kind: "noop", reason: "editing-target" });

		expect(
			policy.decide({
				event: event({ key: "Enter", targetIsEditable: true, metaKey: true }),
				gate: currentGate,
			}),
		).toEqual({
			kind: "handled",
			commands: [
				{ type: "review.setDecision", cardId: "card-1", decision: "accepted" },
			],
		});
	});
});

describe("session shortcut controller", () => {
	it("dispatches only handled commands", () => {
		const dispatched: SessionRuntimeCommand[] = [];
		let currentGate = gate({
			hasReviewCards: true,
			activeReviewCardId: "card-1",
		});
		const controller = createSessionShortcutController({
			policy: createDefaultSessionShortcutPolicy(),
		});
		let handler: ((event: SessionKeyEvent) => boolean) | null = null;
		const stop = controller.start({
			keyboard: {
				bind(nextHandler) {
					handler = nextHandler;
					return () => {
						handler = null;
					};
				},
			},
			commandPort: {
				dispatch(commands) {
					dispatched.push(...commands);
				},
			},
			readGate: () => currentGate,
		});

		expect(handler?.(event({ key: "ArrowRight" }))).toBe(true);
		expect(handler?.(event({ key: "x" }))).toBe(false);
		currentGate = gate({ hasActiveTurn: true });
		expect(handler?.(event({ key: "Escape" }))).toBe(true);
		stop();
		expect(handler).toBeNull();
		expect(dispatched).toEqual([
			{ type: "review.move", delta: 1 },
			{ type: "turn.stop" },
		]);
	});
});

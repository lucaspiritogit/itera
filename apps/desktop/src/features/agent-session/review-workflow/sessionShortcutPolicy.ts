import type { ReviewDecision } from "../model/reviewDecision";

export type SessionKeyEvent = {
	key: string;
	metaKey: boolean;
	ctrlKey: boolean;
	targetIsEditable: boolean;
};

export type SessionGateState = {
	hasActiveTurn: boolean;
	pendingExplorationDecision: boolean;
	hasReviewCards: boolean;
	activeReviewCardId?: string;
};

export type SessionRuntimeCommand =
	| { type: "review.move"; delta: 1 | -1 }
	| { type: "review.setDecision"; cardId: string; decision: ReviewDecision }
	| { type: "finding.resolve"; action: "approve" | "dismiss" }
	| { type: "turn.stop" }
	| { type: "review.toggleDiffStyle" };

export type SessionIntentDecision =
	| {
			kind: "noop";
			reason: "editing-target" | "not-applicable" | "missing-active-card";
		}
	| {
			kind: "handled";
			commands: SessionRuntimeCommand[];
		};

export type SessionShortcutPolicy = {
	decide(input: {
		event: SessionKeyEvent;
		gate: SessionGateState;
	}): SessionIntentDecision;
};

export type SessionKeyboardPort = {
	bind(handler: (event: SessionKeyEvent) => boolean): () => void;
};

export type SessionCommandPort = {
	dispatch(commands: SessionRuntimeCommand[]): void;
};

export type SessionShortcutController = {
	start(input: {
		keyboard: SessionKeyboardPort;
		commandPort: SessionCommandPort;
		readGate: () => SessionGateState;
	}): () => void;
};

function isAcceptShortcut(event: SessionKeyEvent): boolean {
	return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

export function createDefaultSessionShortcutPolicy(): SessionShortcutPolicy {
	return {
		decide({ event, gate }): SessionIntentDecision {
			const acceptShortcut = isAcceptShortcut(event);
			if (event.targetIsEditable && !acceptShortcut) {
				return { kind: "noop", reason: "editing-target" };
			}

			if (gate.hasActiveTurn) {
				if (event.key === "Escape") {
					return { kind: "handled", commands: [{ type: "turn.stop" }] };
				}
				return { kind: "noop", reason: "not-applicable" };
			}

			if (gate.hasReviewCards) {
				if (event.key === "ArrowRight") {
					return {
						kind: "handled",
						commands: [{ type: "review.move", delta: 1 }],
					};
				}
				if (event.key === "ArrowLeft") {
					return {
						kind: "handled",
						commands: [{ type: "review.move", delta: -1 }],
					};
				}
				if (acceptShortcut) {
					if (!gate.activeReviewCardId) {
						return { kind: "noop", reason: "missing-active-card" };
					}
					return {
						kind: "handled",
						commands: [
							{
								type: "review.setDecision",
								cardId: gate.activeReviewCardId,
								decision: "accepted",
							},
						],
					};
				}
				if (event.key.toLowerCase() === "d") {
					if (!gate.activeReviewCardId) {
						return { kind: "noop", reason: "missing-active-card" };
					}
					return {
						kind: "handled",
						commands: [
							{
								type: "review.setDecision",
								cardId: gate.activeReviewCardId,
								decision: "denied",
							},
						],
					};
				}
				if (event.key.toLowerCase() === "v") {
					return {
						kind: "handled",
						commands: [{ type: "review.toggleDiffStyle" }],
					};
				}
				return { kind: "noop", reason: "not-applicable" };
			}

			if (gate.pendingExplorationDecision) {
				if (acceptShortcut) {
					return {
						kind: "handled",
						commands: [{ type: "finding.resolve", action: "approve" }],
					};
				}
				if (event.key.toLowerCase() === "d") {
					return {
						kind: "handled",
						commands: [{ type: "finding.resolve", action: "dismiss" }],
					};
				}
			}

			return { kind: "noop", reason: "not-applicable" };
		},
	};
}

export function createSessionShortcutController(input: {
	policy: SessionShortcutPolicy;
}): SessionShortcutController {
	return {
		start({ keyboard, commandPort, readGate }) {
			return keyboard.bind((event) => {
				const decision = input.policy.decide({
					event,
					gate: readGate(),
				});
				if (decision.kind === "handled" && decision.commands.length > 0) {
					commandPort.dispatch(decision.commands);
					return true;
				}
				return false;
			});
		},
	};
}

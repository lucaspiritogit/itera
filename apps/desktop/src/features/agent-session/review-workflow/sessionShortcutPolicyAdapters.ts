import type { MutableRefObject } from "react";
import type { AgentSessionOrchestrator, AgentSessionSnapshot } from "../agent-session/types";
import type {
	SessionCommandPort,
	SessionGateState,
	SessionKeyboardPort,
} from "./sessionShortcutPolicy";

export function createWindowKeyboardPort(input: {
	isEditableTarget: (target: EventTarget | null) => boolean;
	target?: Window;
}): SessionKeyboardPort {
	const target = input.target ?? window;
	return {
		bind(handler) {
			const onKeyDown = (event: KeyboardEvent) => {
				const handled = handler({
					key: event.key,
					metaKey: event.metaKey,
					ctrlKey: event.ctrlKey,
					targetIsEditable: input.isEditableTarget(event.target),
				});
				if (handled) {
					event.preventDefault();
				}
			};
			target.addEventListener("keydown", onKeyDown);
			return () => {
				target.removeEventListener("keydown", onKeyDown);
			};
		},
	};
}

export function createSessionCommandPort(input: {
	session: Pick<
		AgentSessionOrchestrator,
		| "moveReviewCursor"
		| "setReviewDecision"
		| "resolveFinding"
		| "stopTurn"
	>;
	onToggleReviewDiffStyle: () => void;
}): SessionCommandPort {
	return {
		dispatch(commands) {
			for (const command of commands) {
				if (command.type === "review.move") {
					input.session.moveReviewCursor(command.delta);
					continue;
				}
				if (command.type === "review.setDecision") {
					input.session.setReviewDecision(command.cardId, command.decision);
					continue;
				}
				if (command.type === "finding.resolve") {
					input.session.resolveFinding(command.action);
					continue;
				}
				if (command.type === "turn.stop") {
					input.session.stopTurn();
					continue;
				}
				input.onToggleReviewDiffStyle();
			}
		},
	};
}

export function readSessionPolicyGate(
	snapshot: AgentSessionSnapshot,
): SessionGateState {
	const active = snapshot.reviewBatch?.cards[snapshot.reviewBatch.activeIndex];
	return {
		hasActiveTurn: snapshot.hasActiveTurn,
		pendingExplorationDecision: snapshot.pendingExplorationDecision,
		hasReviewCards: Boolean(snapshot.reviewBatch?.cards.length),
		activeReviewCardId: active?.id,
	};
}

export function createSessionGateReader(
	snapshotRef: MutableRefObject<AgentSessionSnapshot>,
): () => SessionGateState {
	return () => readSessionPolicyGate(snapshotRef.current);
}

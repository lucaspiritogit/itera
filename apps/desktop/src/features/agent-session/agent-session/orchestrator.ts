import type {
	CodexTurnContext,
	RpcHandlerResult,
} from "../../../integrations/codex/codexWire";
import type { ReviewDecision } from "../model/reviewDecision";
import type { FileLoadState } from "../model/fileLoadState";
import type { ReviewCard } from "../../../features/review/reviewDiff";
import type {
	AgentInboundEnvelope,
	AgentSessionCommand,
	AgentSessionEvent,
	AgentSessionMode,
	AgentSessionOrchestrator,
	AgentSessionPorts,
	AgentSessionSnapshot,
	AgentWireConnection,
	ChatItem,
	ReviewBatch,
	ReviewPromptKind,
	SystemMessage,
} from "./types";

type MutableState = Omit<
	AgentSessionSnapshot,
	| "canSend"
	| "pendingReviewCount"
	| "pendingExplorationDecision"
	| "pendingReviewDecision"
>;

function initialState(cwd: string, mode: AgentSessionMode): MutableState {
	return {
		cwd,
		status: "idle",
		mode,
		hasActiveTurn: false,
		activeStep: null,
		chatItems: [],
		systemMessages: [],
		finding: null,
		findingResolved: false,
		fileState: { status: "idle" },
		reviewBatch: null,
	};
}

function createTurnContext(): CodexTurnContext {
	return {
		finalAgentText: "",
		reviewFragments: [],
		lastTurnDiff: "",
	};
}

function pendingReviewCount(batch: ReviewBatch | null): number {
	return (
		batch?.cards.filter((card) => batch.decisions[card.id] === "pending")
			.length ?? 0
	);
}

function nextPendingReviewIndex(
	batch: ReviewBatch,
	decisions: Record<string, ReviewDecision>,
	fromIndex: number,
): number {
	if (batch.cards.length === 0) {
		return 0;
	}
	for (let offset = 1; offset <= batch.cards.length; offset += 1) {
		const index = (fromIndex + offset) % batch.cards.length;
		if (decisions[batch.cards[index].id] === "pending") {
			return index;
		}
	}
	return Math.min(Math.max(fromIndex, 0), batch.cards.length - 1);
}

function reviewCardSummary(card: ReviewCard): string {
	if (card.kind === "raw") {
		return `- Type: raw patch
- Patch:
${card.rawPatch.slice(0, 4000)}`;
	}
	return `- File: ${card.filePath}`;
}

function buildReviewPrompt(input: {
	kind: ReviewPromptKind;
	text: string;
	state: MutableState;
}): string | null {
	if (input.state.finding && !input.state.findingResolved) {
		const finding = input.state.finding;
		const intent =
			input.kind === "ask"
				? "Answer this review question about the exploration finding. Do not edit files and do not resolve the pending finding unless the developer explicitly accepts or denies it."
				: "Continue the exploration review loop using this steering feedback. Do not edit files. Return an updated exploration finding for review, shaped exactly like the original exploration JSON object.";
		return `${intent}

Review target: exploration finding
- File: ${finding.file}
- Lines: ${finding.startLine ?? "unknown"}-${finding.endLine ?? "unknown"}
- Finding: ${finding.reason}
- Code excerpt:
${finding.code}

Developer ${input.kind === "ask" ? "question" : "steer"}:
${input.text}`;
	}
	const batch = input.state.reviewBatch;
	if (!batch || batch.cards.length === 0) {
		return null;
	}
	const active =
		batch.cards[
		Math.min(Math.max(batch.activeIndex, 0), batch.cards.length - 1)
		];
	if (!active) {
		return null;
	}
	const pending = pendingReviewCount(batch);
	const intent =
		input.kind === "ask"
			? "Answer this review question about the selected change. Do not resolve the pending review item unless the developer explicitly accepts or denies it."
			: "Continue the implement-review loop using this steering feedback. Revise the selected change as requested, keep unresolved review items pending, and return an updated patch for review.";
	return `${intent}

Review target: selected file change
${reviewCardSummary(active)}

Pending changes in batch: ${pending}
All files in batch:
${batch.cards.map((card, index) => `- ${index === batch.activeIndex ? "[selected] " : ""}${card.filePath}: ${batch.decisions[card.id]}`).join("\n")}

Developer ${input.kind === "ask" ? "question" : "steer"}:
${input.text}`;
}

function computeSnapshot(state: MutableState): AgentSessionSnapshot {
	const reviewCount = pendingReviewCount(state.reviewBatch);
	const pendingExplorationDecision =
		Boolean(state.finding) && !state.findingResolved;
	const pendingReviewDecision = reviewCount > 0;
	return {
		...state,
		pendingReviewCount: reviewCount,
		pendingExplorationDecision,
		pendingReviewDecision,
		canSend:
			state.status === "ready" &&
			!state.hasActiveTurn &&
			!pendingExplorationDecision &&
			!pendingReviewDecision,
	};
}

export function createAgentSessionOrchestrator({
	ports,
	initial,
}: {
	ports: AgentSessionPorts;
	initial: { cwd: string; mode?: AgentSessionMode };
}): AgentSessionOrchestrator {
	let state = initialState(initial.cwd, initial.mode ?? "exploration");
	let turnCtx = createTurnContext();
	let connection: AgentWireConnection | null = null;
	let latestUserPrompt: string | null = null;
	let fileRequestId: string | null = null;
	let lastConnectInput: { cwd: string; model?: string } | null = null;
	const listeners = new Set<
		(event: AgentSessionEvent, snapshot: AgentSessionSnapshot) => void
	>();

	function getSnapshot(): AgentSessionSnapshot {
		return computeSnapshot(state);
	}

	function emit(event: AgentSessionEvent): void {
		const snapshot = getSnapshot();
		for (const listener of listeners) {
			listener(event, snapshot);
		}
	}

	function pushSystem(message: SystemMessage): void {
		state = {
			...state,
			systemMessages: [...state.systemMessages.slice(-19), message],
		};
		emit({ type: "message", role: message.role, text: message.text });
	}

	function setStatus(status: MutableState["status"], detail?: string): void {
		state = { ...state, status };
		emit({ type: "status", status, detail });
	}

	function setMode(mode: AgentSessionMode): void {
		state = { ...state, mode };
		emit({ type: "mode", mode });
	}

	function setActiveStep(step: MutableState["activeStep"]): void {
		state = { ...state, activeStep: step };
		emit({ type: "step", step });
	}

	function setFileState(fileState: FileLoadState): void {
		state = { ...state, fileState };
		emit({ type: "file", state: fileState });
	}

	function setTurnActive(active: boolean): void {
		state = { ...state, hasActiveTurn: active };
		emit({ type: "turn", active });
	}

	function setReviewBatch(reviewBatch: ReviewBatch | null): void {
		state = { ...state, reviewBatch };
		emit({
			type: "review",
			batch: reviewBatch,
			pendingCount: pendingReviewCount(reviewBatch),
		});
	}

	function addChatItem(item: ChatItem): void {
		state = { ...state, chatItems: [...state.chatItems, item] };
		emit({ type: "chat-item", item });
	}

	function replaceReviewChatItem(batch: ReviewBatch): void {
		state = {
			...state,
			chatItems: [
				...state.chatItems.filter((item) => item.type !== "review"),
				{ id: batch.id, type: "review", batch },
			],
		};
		emit({
			type: "chat-item",
			item: { id: batch.id, type: "review", batch },
		});
	}

	function resetTurnAccumulator(): void {
		turnCtx.finalAgentText = "";
		turnCtx.reviewFragments = [];
		turnCtx.lastTurnDiff = "";
		fileRequestId = null;
	}

	function sendEncoded(raw: string): boolean {
		if (!connection) {
			return false;
		}
		try {
			connection.send(raw);
			return true;
		} catch (err) {
			pushSystem({
				role: "stderr",
				text: err instanceof Error ? err.message : String(err),
			});
			setTurnActive(false);
			return false;
		}
	}

	function sendTurn(text: string): void {
		if (state.status !== "ready") {
			return;
		}
		setActiveStep(null);
		setTurnActive(true);
		resetTurnAccumulator();
		sendEncoded(ports.wireCodec.encodeUserText(text));
	}

	function requestFile(path: string): void {
		if (!connection) {
			setFileState({ status: "error", error: "Not connected to backend." });
			return;
		}
		const requestId = ports.id.next("file");
		fileRequestId = requestId;
		setFileState({ status: "loading" });
		sendEncoded(ports.wireCodec.encodeReadFile(path, requestId));
	}

	function mergeReviewCards(cards: ReviewCard[], assistantText: string): void {
		const batchId = ports.id.next("review");
		const previous = state.reviewBatch;
		const pendingPreviousCards =
			previous?.cards.filter(
				(card) => previous.decisions[card.id] === "pending",
			) ?? [];
		const mergedCards = ports.reviewParser.compact([
			...pendingPreviousCards,
			...cards,
		]);
		const decisions: Record<string, ReviewDecision> = {};
		for (const card of mergedCards) {
			decisions[card.id] = previous?.decisions[card.id] ?? "pending";
		}
		const nextBatch: ReviewBatch = {
			id: batchId,
			cards: mergedCards,
			decisions,
			activeIndex: Math.min(
				previous?.activeIndex ?? 0,
				Math.max(mergedCards.length - 1, 0),
			),
			assistantText,
		};
		setReviewBatch(nextBatch);
		replaceReviewChatItem(nextBatch);
	}

	function applyRpcResult(res: RpcHandlerResult): void {
		if (res.resetTurnAccumulator) {
			turnCtx.finalAgentText = "";
		}
		if (res.processStep) {
			setActiveStep(res.processStep);
		}
		if (res.clearProcessStep) {
			setActiveStep(null);
		}
		if (res.appendStderr) {
			pushSystem({ role: "stderr", text: res.appendStderr });
			setTurnActive(false);
		}
		if (res.finding) {
			state = {
				...state,
				finding: res.finding,
				findingResolved: false,
			};
			addChatItem({
				id: ports.id.next("finding"),
				type: "finding",
				finding: res.finding,
			});
			setMode("editing");
			setTurnActive(false);
			emit({
				type: "finding",
				finding: res.finding,
				requiresDecision: true,
			});
		}
		if (res.reviewPatch && res.reviewPatch.trim().length > 0) {
			const cards = ports.reviewParser.parsePatch(
				res.reviewPatch,
				ports.id.next("review"),
			);
			if (cards.length > 0) {
				mergeReviewCards(cards, res.appendAssistant ?? "");
			}
		}
		if (res.appendAssistant !== undefined) {
			if (!res.finding && !res.reviewPatch) {
				addChatItem({
					id: ports.id.next("assistant"),
					type: "assistant",
					text: res.appendAssistant,
				});
			}
			setTurnActive(false);
		}
	}

	function handleEnvelope(envelope: AgentInboundEnvelope): void {
		if (envelope.type === "backend.ready") {
			setStatus("ready");
			pushSystem({
				role: "system",
				text: `Session ready (thread ${envelope.threadId}).`,
			});
			return;
		}
		if (envelope.type === "backend.error") {
			setStatus("error");
			pushSystem({ role: "stderr", text: envelope.message });
			return;
		}
		if (envelope.type === "backend.stderr") {
			pushSystem({ role: "stderr", text: envelope.text });
			return;
		}
		if (envelope.type === "backend.file") {
			const f = envelope.payload;
			if (fileRequestId && f.requestId && f.requestId !== fileRequestId) {
				return;
			}
			if (typeof f.error === "string") {
				setFileState({ status: "error", error: f.error });
				return;
			}
			if (typeof f.content === "string") {
				setFileState({
					status: "ready",
					content: f.content,
					size: typeof f.size === "number" ? f.size : undefined,
				});
			}
			return;
		}
		applyRpcResult(ports.rpcReducer.apply(envelope.payload, turnCtx));
	}

	function resetSession({
		keepConnection = false,
		mode = "exploration",
	}: {
		keepConnection?: boolean;
		mode?: AgentSessionMode;
	} = {}): void {
		if (!keepConnection) {
			connection?.close();
			connection = null;
		}
		state = initialState(state.cwd, mode);
		turnCtx = createTurnContext();
		latestUserPrompt = null;
		fileRequestId = null;
		emit({ type: "mode", mode });
	}

	function connect(input: { cwd: string; model?: string }): void {
		connection?.close();
		lastConnectInput = input;
		state = {
			...initialState(input.cwd, "exploration"),
			status: "connecting",
		};
		turnCtx = createTurnContext();
		latestUserPrompt = null;
		fileRequestId = null;
		connection = ports.transport.connect(input);
		connection.onOpen(() => {
			pushSystem({ role: "system", text: `Connecting…\n${input.cwd}` });
		});
		connection.onMessage((raw) => {
			for (const envelope of ports.wireCodec.parseInbound(raw)) {
				handleEnvelope(envelope);
			}
		});
		connection.onError(() => {
			setStatus("error");
			pushSystem({
				role: "stderr",
				text: "Codex transport error.",
			});
		});
		connection.onClose(() => {
			connection = null;
			state = {
				...state,
				status: "idle",
			};
			turnCtx.reviewFragments = [];
			turnCtx.lastTurnDiff = "";
			pushSystem({ role: "system", text: "Disconnected from backend." });
			emit({ type: "status", status: "idle" });
		});
		emit({ type: "status", status: "connecting" });
	}

	function disconnect(): void {
		connection?.close();
		connection = null;
	}

	function sendUserText(
		text: string,
		options?: { mode?: AgentSessionMode; metadata?: Record<string, unknown> },
	): void {
		latestUserPrompt = text;
		addChatItem({
			id: ports.id.next("user"),
			type: "user",
			text,
		});
		const mode = options?.mode ?? "exploration";
		const prompt = ports.promptPolicy.buildInitialPrompt({
			mode,
			userText: text,
		});
		if (mode !== state.mode) {
			setMode(mode);
		}
		if (mode !== "editing") {
			state = {
				...state,
				finding: null,
				findingResolved: false,
				fileState: { status: "idle" },
			};
		}
		sendTurn(prompt);
	}

	function sendReviewText(kind: ReviewPromptKind, text: string): void {
		const trimmed = text.trim();
		if (!trimmed || state.hasActiveTurn) {
			return;
		}
		const prompt = buildReviewPrompt({ kind, text: trimmed, state });
		if (!prompt) {
			return;
		}
		addChatItem({
			id: ports.id.next("user"),
			type: "user",
			text: `${kind === "ask" ? "Ask" : "Steer"}: ${trimmed}`,
		});
		sendTurn(prompt);
	}

	function stopTurn(): void {
		if (!state.hasActiveTurn) {
			return;
		}
		if (sendEncoded(ports.wireCodec.encodeStopTurn())) {
			setActiveStep(null);
			setTurnActive(false);
			pushSystem({ role: "system", text: "Stop requested." });
		}
	}

	function setReviewDecision(cardId: string, decision: ReviewDecision): void {
		const batch = state.reviewBatch;
		if (!batch || !batch.cards.some((card) => card.id === cardId)) {
			return;
		}
		if (batch.decisions[cardId] === decision) {
			return;
		}
		const nextBatch = {
			...batch,
			decisions: {
				...batch.decisions,
				[cardId]: decision,
			},
		};
		nextBatch.activeIndex = nextPendingReviewIndex(
			nextBatch,
			nextBatch.decisions,
			batch.cards.findIndex((card) => card.id === cardId),
		);
		setReviewBatch(nextBatch);
		state = {
			...state,
			chatItems: state.chatItems.map((item) =>
				item.type === "review" && item.batch.id === nextBatch.id
					? { ...item, batch: nextBatch }
					: item,
			),
		};
		if (pendingReviewCount(nextBatch) === 0) {
			const denied = nextBatch.cards.filter(
				(card) => nextBatch.decisions[card.id] === "denied",
			).length;
			const accepted = nextBatch.cards.length - denied;
			pushSystem({
				role: "system",
				text:
					denied > 0
						? `Review resolved: ${accepted} accepted, ${denied} denied. Flow paused; send your next instruction when ready.`
						: `Review resolved: ${accepted} accepted, ${denied} denied.`,
			});
			setMode("exploration");
		}
	}

	function moveReviewCursor(delta: number): void {
		const batch = state.reviewBatch;
		if (!batch || batch.cards.length === 0) {
			return;
		}
		const nextBatch = {
			...batch,
			activeIndex:
				(batch.activeIndex + delta + batch.cards.length) % batch.cards.length,
		};
		setReviewBatch(nextBatch);
		state = {
			...state,
			chatItems: state.chatItems.map((item) =>
				item.type === "review" && item.batch.id === nextBatch.id
					? { ...item, batch: nextBatch }
					: item,
			),
		};
	}

	const api: AgentSessionOrchestrator = {
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
		getSnapshot,
		dispatch(command: AgentSessionCommand) {
			switch (command.type) {
				case "connect":
					connect(command);
					return;
				case "disconnect":
					disconnect();
					return;
				case "reconnect":
					if (lastConnectInput) {
						connect({
							cwd: command.cwd ?? lastConnectInput.cwd,
							model: command.model ?? lastConnectInput.model,
						});
					}
					return;
				case "sendUserText":
					sendUserText(command.text, { mode: command.mode });
					return;
				case "stopTurn":
					stopTurn();
					return;
				case "sendRawRpc":
					api.sendRawRpc(command.line);
					return;
				case "requestFile":
					requestFile(command.path);
					return;
				case "resolveFinding":
					api.resolveFinding(command.action, { prompt: command.prompt });
					return;
				case "sendReviewText":
					api.sendReviewText(command.kind, command.text);
					return;
				case "setReviewDecision":
					setReviewDecision(command.cardId, command.decision);
					return;
				case "moveReviewCursor":
					moveReviewCursor(command.delta);
					return;
				case "resolveReview":
					api.resolveReview();
					return;
				case "setMode":
					setMode(command.mode);
					return;
				case "reset":
					resetSession(command);
			}
		},
		connect,
		disconnect,
		reconnect(input) {
			if (lastConnectInput || input?.cwd) {
				connect({
					cwd: input?.cwd ?? lastConnectInput?.cwd ?? state.cwd,
					model: input?.model ?? lastConnectInput?.model,
				});
			}
		},
		sendUserText,
		sendReviewText,
		stopTurn,
		sendRawRpc(line) {
			sendEncoded(ports.wireCodec.encodeRawRpc(line));
		},
		requestFile,
		resolveFinding(action, options) {
			if (action === "approve") {
				if (!state.finding) {
					return;
				}
				const finding = state.finding;
				state = {
					...state,
					findingResolved: true,
				};
				setMode("editing");
				pushSystem({
					role: "system",
					text: "Exploration reviewed. Starting edit flow.",
				});
				if (latestUserPrompt) {
					const followup = ports.promptPolicy.buildFollowupPrompt({
						userText: latestUserPrompt,
						finding,
					});
					if (followup) {
						sendTurn(followup);
					}
				}
				return;
			}
			if (action === "dismiss") {
				state = {
					...state,
					mode: "exploration",
					finding: null,
					findingResolved: false,
					fileState: { status: "idle" },
					activeStep: null,
				};
				fileRequestId = null;
				emit({ type: "mode", mode: "exploration" });
				return;
			}
			if (action === "edit" && options?.prompt) {
				setMode("editing");
				sendUserText(options.prompt, { mode: "editing" });
			}
		},
		setReviewDecision,
		moveReviewCursor,
		resolveReview() {
			const batch = state.reviewBatch;
			if (!batch) {
				return;
			}
			const decisions = { ...batch.decisions };
			for (const card of batch.cards) {
				if (decisions[card.id] === "pending") {
					decisions[card.id] = "accepted";
				}
			}
			setReviewBatch({ ...batch, decisions });
		},
		setMode,
		reset: resetSession,
	};

	return api;
}

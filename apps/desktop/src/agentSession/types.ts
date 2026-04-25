import type {
	CodexTurnContext,
	ExplorationFinding,
	ProcessStep,
	RpcHandlerResult,
} from "../codexWire";
import type { ReviewDecision } from "../components/ChangeReviewQueue";
import type { FileLoadState } from "../components/ExplorationFinding";
import type { ReviewCard } from "../reviewDiff";

export type AgentSessionMode = "exploration" | "editing" | string;

export type AgentSessionStatus = "idle" | "connecting" | "ready" | "error";

export type SystemMessage = {
	role: "system" | "stderr";
	text: string;
};

export type BackendFilePayload = {
	path: string;
	requestId?: string;
	content?: string;
	size?: number;
	error?: string;
};

export type ReviewBatch = {
	id: string;
	cards: ReviewCard[];
	decisions: Record<string, ReviewDecision>;
	activeIndex: number;
	assistantText: string;
};

export type ReviewPromptKind = "ask" | "steer";

export type ChatItem =
	| { id: string; type: "user"; text: string }
	| { id: string; type: "assistant"; text: string }
	| { id: string; type: "finding"; finding: ExplorationFinding }
	| { id: string; type: "review"; batch: ReviewBatch };

export type AgentSessionSnapshot = {
	cwd: string;
	status: AgentSessionStatus;
	mode: AgentSessionMode;
	canSend: boolean;
	hasActiveTurn: boolean;
	activeStep: ProcessStep | null;
	chatItems: ChatItem[];
	systemMessages: SystemMessage[];
	finding: ExplorationFinding | null;
	findingResolved: boolean;
	fileState: FileLoadState;
	reviewBatch: ReviewBatch | null;
	pendingReviewCount: number;
	pendingExplorationDecision: boolean;
	pendingReviewDecision: boolean;
};

export type AgentSessionEvent =
	| { type: "status"; status: AgentSessionStatus; detail?: string }
	| { type: "step"; step: ProcessStep | null }
	| { type: "message"; role: SystemMessage["role"]; text: string }
	| { type: "chat-item"; item: ChatItem }
	| { type: "mode"; mode: AgentSessionMode }
	| { type: "file"; state: FileLoadState }
	| { type: "finding"; finding: ExplorationFinding; requiresDecision: boolean }
	| { type: "review"; batch: ReviewBatch | null; pendingCount: number }
	| { type: "turn"; active: boolean };

export type AgentInboundEnvelope =
	| { type: "backend.ready"; threadId: string; cwd: string; model: string }
	| { type: "backend.error"; message: string }
	| { type: "backend.stderr"; text: string }
	| { type: "backend.file"; payload: BackendFilePayload }
	| { type: "codex.rpc"; payload: Record<string, unknown> };

export type AgentWireConnection = {
	send(raw: string): void;
	close(): void;
	onOpen(cb: () => void): void;
	onMessage(cb: (raw: string) => void): void;
	onError(cb: (error?: unknown) => void): void;
	onClose(cb: () => void): void;
};

export type AgentSessionPorts = {
	transport: {
		connect(input: { cwd: string; model?: string }): AgentWireConnection;
	};
	wireCodec: {
		parseInbound(raw: string): AgentInboundEnvelope[];
		encodeUserText(text: string): string;
		encodeReadFile(path: string, requestId: string): string;
		encodeRawRpc(line: string): string;
		encodeStopTurn(): string;
	};
	rpcReducer: {
		apply(o: Record<string, unknown>, ctx: CodexTurnContext): RpcHandlerResult;
	};
	reviewParser: {
		parsePatch(patch: string, batchId: string): ReviewCard[];
		compact(cards: ReviewCard[]): ReviewCard[];
	};
	promptPolicy: {
		buildInitialPrompt(input: {
			mode: AgentSessionMode;
			userText: string;
		}): string;
		buildFollowupPrompt(input: {
			userText: string;
			finding: ExplorationFinding;
		}): string | null;
	};
	id: {
		next(prefix: string): string;
	};
};

export type AgentSessionCommand =
	| { type: "connect"; cwd: string; model?: string }
	| { type: "disconnect" }
	| { type: "reconnect"; cwd?: string; model?: string }
	| { type: "sendUserText"; text: string; mode?: AgentSessionMode }
	| { type: "stopTurn" }
	| { type: "sendRawRpc"; line: string }
	| { type: "requestFile"; path: string }
	| {
		type: "resolveFinding";
		action: "approve" | "dismiss" | "edit";
		prompt?: string;
	}
	| { type: "sendReviewText"; kind: ReviewPromptKind; text: string }
	| { type: "setReviewDecision"; cardId: string; decision: ReviewDecision }
	| { type: "moveReviewCursor"; delta: number }
	| { type: "resolveReview" }
	| { type: "setMode"; mode: AgentSessionMode }
	| { type: "reset"; keepConnection?: boolean; mode?: AgentSessionMode };

export type AgentSessionOrchestrator = {
	subscribe(
		listener: (
			event: AgentSessionEvent,
			snapshot: AgentSessionSnapshot,
		) => void,
	): () => void;
	getSnapshot(): AgentSessionSnapshot;
	dispatch(command: AgentSessionCommand): void;
	connect(input: { cwd: string; model?: string }): void;
	disconnect(): void;
	reconnect(input?: { cwd?: string; model?: string }): void;
	sendUserText(
		text: string,
		options?: { mode?: AgentSessionMode; metadata?: Record<string, unknown> },
	): void;
	stopTurn(): void;
	sendRawRpc(line: string): void;
	requestFile(path: string): void;
	resolveFinding(
		action: "approve" | "dismiss" | "edit",
		options?: { prompt?: string },
	): void;
	sendReviewText(kind: ReviewPromptKind, text: string): void;
	setReviewDecision(cardId: string, decision: ReviewDecision): void;
	moveReviewCursor(delta: number): void;
	resolveReview(): void;
	setMode(mode: AgentSessionMode): void;
	reset(input?: { keepConnection?: boolean; mode?: AgentSessionMode }): void;
};

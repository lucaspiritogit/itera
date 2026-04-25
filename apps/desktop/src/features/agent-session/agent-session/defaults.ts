import {
	type ExplorationFinding,
	handleCodexRpcLine,
} from "../../../integrations/codex/codexWire";
import {
	compactOverlappingReviewCards,
	parseReviewCardsFromPatch,
} from "../../../features/review/reviewDiff";
import type {
	AgentInboundEnvelope,
	AgentSessionMode,
	AgentSessionPorts,
	AgentWireConnection,
} from "./types";

export const EXPLORATION_PREAMBLE = `You are in EXPLORATION MODE for Itera.

Strict rules:
- Do NOT edit, create, delete, or patch any file.
- Do NOT call apply_patch or any write/edit tool.
- Explore the codebase normally: search, read multiple files, and inspect the paths needed to understand the likely change.
- When you are ready, identify the most useful code excerpt for the developer to review before any edit happens. Prefer the function, component, type, config block, or call site that best explains the likely change.
- The excerpt can come from one file, but your exploration should not be limited to one file.
- Your FINAL assistant message MUST be exactly one JSON object, with no prose before or after, no markdown, no code fences, shaped like:
  {"file":"<path relative to workspace root>","startLine":<first line number>,"endLine":<last line number>,"reason":"<what you found and why this code matters, including other relevant files if any>","code":"<verbatim code excerpt>"}
- The "file" must be a real, existing file in the workspace.
- The "code" must be a concise verbatim excerpt from that file, usually 20-80 lines. Include enough surrounding context to understand the planned change, but not the whole file unless it is very small.
- The "reason" should explain what is going to change before editing begins.

User request:`;

export function buildEditPromptFromExploration(
	userPrompt: string,
	finding: ExplorationFinding,
): string {
	return `Continue from the reviewed exploration finding into editing mode.

Original user request:
${userPrompt}

Reviewed exploration finding:
- File: ${finding.file}
- Lines: ${finding.startLine ?? "unknown"}-${finding.endLine ?? "unknown"}
- Finding: ${finding.reason}
- Code excerpt:
${finding.code}

Now make the smallest reasonable code change that satisfies the original user request.`;
}

export function buildBackendWsUrl(
	base: string,
	cwd: string,
	model?: string,
): string {
	const u = new URL(base);
	if (cwd.trim().length > 0) {
		u.searchParams.set("cwd", cwd.trim());
	}
	if (model && model.trim().length > 0) {
		u.searchParams.set("model", model.trim());
	}
	return u.toString();
}

function asRecord(v: unknown): Record<string, unknown> | null {
	if (v && typeof v === "object") {
		return v as Record<string, unknown>;
	}
	return null;
}

function readString(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

function parseBackendEnvelope(o: Record<string, unknown>): AgentInboundEnvelope | null {
	const backend = asRecord(o.backend);
	if (!backend) {
		return null;
	}
	if (backend.ready === true && typeof backend.threadId === "string") {
		return {
			type: "backend.ready",
			threadId: backend.threadId,
			cwd: readString(backend.cwd) ?? "",
			model: readString(backend.model) ?? "",
		};
	}
	const error = readString(backend.error);
	if (error) {
		return { type: "backend.error", message: error };
	}
	const stderr = readString(backend.stderr);
	if (stderr) {
		return { type: "backend.stderr", text: stderr };
	}
	const file = asRecord(backend.file);
	if (file) {
		return {
			type: "backend.file",
			payload: {
				path: readString(file.path) ?? "",
				requestId: readString(file.requestId),
				content: readString(file.content),
				size: typeof file.size === "number" ? file.size : undefined,
				error: readString(file.error),
			},
		};
	}
	return null;
}

function parseOneInbound(raw: string): AgentInboundEnvelope[] {
	const trimmed = raw.trim();
	if (!trimmed) {
		return [];
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch {
		return trimmed
			.split("\n")
			.flatMap((line) => parseOneInbound(line));
	}
	const o = asRecord(parsed);
	if (!o) {
		return [];
	}
	const backend = parseBackendEnvelope(o);
	if (backend) {
		return [backend];
	}
	return [{ type: "codex.rpc", payload: o }];
}

export function createBackendWireCodec(): AgentSessionPorts["wireCodec"] {
	return {
		parseInbound(raw) {
			return parseOneInbound(raw);
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
	};
}

export function createBrowserWebSocketTransport(
	baseWsUrl: string,
): AgentSessionPorts["transport"] {
	return {
		connect({ cwd, model }) {
			const ws = new WebSocket(buildBackendWsUrl(baseWsUrl, cwd, model));
			const connection: AgentWireConnection = {
				send(raw) {
					ws.send(raw);
				},
				close() {
					ws.close();
				},
				onOpen(cb) {
					ws.onopen = () => cb();
				},
				onMessage(cb) {
					ws.onmessage = (ev) =>
						cb(typeof ev.data === "string" ? ev.data : String(ev.data));
				},
				onError(cb) {
					ws.onerror = (event) => cb(event);
				},
				onClose(cb) {
					ws.onclose = () => cb();
				},
			};
			return connection;
		},
	};
}

export function createDefaultAgentSessionPorts(
	baseWsUrl: string,
): AgentSessionPorts {
	return {
		transport: createBrowserWebSocketTransport(baseWsUrl),
		wireCodec: createBackendWireCodec(),
		rpcReducer: {
			apply: handleCodexRpcLine,
		},
		reviewParser: {
			parsePatch: parseReviewCardsFromPatch,
			compact: compactOverlappingReviewCards,
		},
		promptPolicy: {
			buildInitialPrompt({
				mode,
				userText,
			}: {
				mode: AgentSessionMode;
				userText: string;
			}) {
				return mode === "editing"
					? userText
					: `${EXPLORATION_PREAMBLE}\n${userText}`;
			},
			buildFollowupPrompt({ userText, finding }) {
				return buildEditPromptFromExploration(userText, finding);
			},
		},
		id: {
			next(prefix) {
				return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
			},
		},
	};
}

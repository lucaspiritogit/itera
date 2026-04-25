export type ProcessStep = {
	title: string;
	detail?: string;
};

export type ExplorationFinding = {
	file: string;
	reason: string;
	code: string;
	startLine?: number;
	endLine?: number;
};

export type RpcHandlerResult = {
	processStep?: ProcessStep;
	clearProcessStep?: boolean;
	startAssistantMessage?: boolean;
	appendAssistantDelta?: string;
	appendAssistant?: string;
	appendStderr?: string;
	resetTurnAccumulator?: boolean;
	recordAgentMessage?: { text: string; phase?: string };
	reviewPatch?: string | null;
	finding?: ExplorationFinding | null;
};

export type CodexTurnContext = {
	finalAgentText: string;
	reviewFragments: string[];
	lastTurnDiff: string;
};

function asRecord(v: unknown): Record<string, unknown> | null {
	if (v && typeof v === "object") {
		return v as Record<string, unknown>;
	}
	return null;
}

function readString(v: unknown): string | undefined {
	return typeof v === "string" ? v : undefined;
}

function formatCommand(cmd: unknown): string {
	if (Array.isArray(cmd)) {
		return cmd.map((c) => String(c)).join(" ");
	}
	if (typeof cmd === "string") {
		return cmd;
	}
	return "";
}

function stepForItemStarted(item: Record<string, unknown>): ProcessStep {
	const t = readItemType(item) ?? "";
	switch (t) {
		case "agentMessage":
			return { title: "Composing reply" };
		case "commandExecution":
			return {
				title: "Running command",
				detail: formatCommand(item.command) || undefined,
			};
		case "fileChange":
			return { title: "Applying edits" };
		case "webSearch":
			return {
				title: "Searching the web",
				detail: readString(item.query) ?? undefined,
			};
		case "reasoning":
			return { title: "Reasoning" };
		case "plan":
			return { title: "Planning" };
		case "mcpToolCall":
			return {
				title: "Tool call",
				detail: readString(item.tool) ?? readString(item.server) ?? undefined,
			};
		case "dynamicToolCall":
			return {
				title: "Tool call",
				detail: readString(item.tool) ?? undefined,
			};
		case "contextCompaction":
			return { title: "Compacting context" };
		case "imageView":
			return { title: "Viewing image" };
		case "enteredReviewMode":
		case "exitedReviewMode":
			return { title: "Review mode" };
		default:
			return { title: "Working", detail: t || undefined };
	}
}

function stepForMethod(method: string): ProcessStep | null {
	if (method === "item/plan/delta") {
		return { title: "Updating plan" };
	}
	if (method === "item/commandExecution/outputDelta") {
		return { title: "Command output" };
	}
	if (method === "item/fileChange/outputDelta") {
		return { title: "Patch progress" };
	}
	if (method === "item/reasoning/summaryTextDelta" || method === "item/reasoning/textDelta") {
		return { title: "Reasoning" };
	}
	if (method === "turn/plan/updated") {
		return { title: "Plan updated" };
	}
	if (method === "thread/tokenUsage/updated") {
		return null;
	}
	return null;
}

function readItemType(item: Record<string, unknown>): string | undefined {
	return (
		readString(item.type) ??
		readString(item.itemType) ??
		readString(item.kind)
	);
}

function extractAgentMessageDeltaParams(params: Record<string, unknown> | null): string {
	if (!params) {
		return "";
	}
	const delta = params.delta;
	if (typeof delta === "string") {
		return delta;
	}
	const drec = asRecord(delta);
	if (drec) {
		const t =
			readString(drec.text) ??
			readString(drec.content) ??
			readString(drec.patch);
		if (t) {
			return t;
		}
		const inner = asRecord(drec.delta);
		if (inner) {
			const innerT = readString(inner.text) ?? readString(inner.content);
			if (innerT) {
				return innerT;
			}
		}
	}
	return readString(params.text) ?? readString(params.content) ?? "";
}

function stripCodeFences(text: string): string {
	const trimmed = text.trim();
	if (!trimmed.startsWith("```")) {
		return trimmed;
	}
	const firstNl = trimmed.indexOf("\n");
	if (firstNl < 0) {
		return trimmed;
	}
	const withoutOpen = trimmed.slice(firstNl + 1);
	const lastFence = withoutOpen.lastIndexOf("```");
	if (lastFence < 0) {
		return withoutOpen.trim();
	}
	return withoutOpen.slice(0, lastFence).trim();
}

function lastJsonObjectSubstring(text: string): string | null {
	let depth = 0;
	let end = -1;
	for (let i = text.length - 1; i >= 0; i--) {
		const ch = text[i];
		if (ch === "}") {
			if (depth === 0) {
				end = i;
			}
			depth++;
		} else if (ch === "{") {
			depth--;
			if (depth === 0 && end >= 0) {
				return text.slice(i, end + 1);
			}
		}
	}
	return null;
}

function asFinding(value: unknown): ExplorationFinding | null {
	if (!value || typeof value !== "object") {
		return null;
	}
	const r = value as Record<string, unknown>;
	const file = readString(r.file);
	const reason = readString(r.reason);
	const code = readString(r.code) ?? readString(r.excerpt);
	if (!file || !reason || !code) {
		return null;
	}
	const startLine = typeof r.startLine === "number" ? r.startLine : undefined;
	const endLine = typeof r.endLine === "number" ? r.endLine : undefined;
	return {
		file: file.trim(),
		reason: reason.trim(),
		code,
		...(startLine !== undefined ? { startLine } : {}),
		...(endLine !== undefined ? { endLine } : {}),
	};
}

export function extractFinding(text: string): ExplorationFinding | null {
	const stripped = stripCodeFences(text);
	if (stripped.length === 0) {
		return null;
	}
	try {
		const parsed = JSON.parse(stripped) as unknown;
		const direct = asFinding(parsed);
		if (direct) {
			return direct;
		}
	} catch {
		//
	}
	const fallback = lastJsonObjectSubstring(stripped);
	if (!fallback) {
		return null;
	}
	try {
		return asFinding(JSON.parse(fallback) as unknown);
	} catch {
		return null;
	}
}

function extractFileChangeDiffs(item: Record<string, unknown>): string[] {
	const changes = item.changes;
	if (!Array.isArray(changes)) {
		return [];
	}
	const out: string[] = [];
	for (const c of changes) {
		const r = asRecord(c);
		const d = readString(r?.diff);
		if (d && d.trim().length > 0) {
			out.push(d.trim());
		}
	}
	return out;
}

export function handleCodexRpcLine(
	o: Record<string, unknown>,
	ctx: CodexTurnContext,
): RpcHandlerResult {
	const method = readString(o.method);
	if (!method) {
		if (o.id !== undefined && o.error) {
			const err = asRecord(o.error);
			const msg = err ? readString(err.message) : undefined;
			return {
				clearProcessStep: true,
				appendStderr: msg ?? JSON.stringify(o.error),
			};
		}
		return {};
	}

	if (method === "turn/started") {
		ctx.reviewFragments = [];
		ctx.lastTurnDiff = "";
		return {
			processStep: { title: "Turn started" },
			resetTurnAccumulator: true,
			reviewPatch: null,
		};
	}

	if (method === "item/started") {
		const params = asRecord(o.params);
		const item = params ? asRecord(params.item) : null;
		if (item) {
			const itemType = readItemType(item);
			return {
				processStep: stepForItemStarted(item),
				...(itemType === "agentMessage" ? { startAssistantMessage: true } : {}),
			};
		}
	}

	if (method === "item/agentMessage/delta") {
		const params = asRecord(o.params);
		const chunk = extractAgentMessageDeltaParams(params);
		if (chunk.length > 0) {
			ctx.finalAgentText += chunk;
		}
		return {
			processStep: { title: "Streaming reply" },
			...(chunk.length > 0 ? { appendAssistantDelta: chunk } : {}),
		};
	}

	if (method === "turn/diff/updated") {
		const params = asRecord(o.params);
		const d = readString(params?.diff);
		ctx.lastTurnDiff = d?.trim() ?? "";
		return {
			processStep: { title: "Diff updated" },
		};
	}

	const fromMethod = stepForMethod(method);
	if (fromMethod) {
		return { processStep: fromMethod };
	}

	if (method === "item/completed") {
		const params = asRecord(o.params);
		const item = params ? asRecord(params.item) : null;
		if (!item) {
			return {};
		}
		const itype = readItemType(item);
		if (itype === "fileChange") {
			const frags = extractFileChangeDiffs(item);
			if (frags.length > 0) {
				ctx.reviewFragments.push(...frags);
			}
			return {};
		}
		if (itype === "agentMessage") {
			const text = readString(item.text) ?? "";
			const phase = readString(item.phase);
			return {
				recordAgentMessage: { text, phase },
			};
		}
		return {};
	}

	if (method === "turn/completed" || method === "turn/complete") {
		const params = asRecord(o.params);
		const turn = params ? asRecord(params.turn) : null;
		const status = readString(turn?.status) ?? "completed";
		let errMsg = "";
		if (status === "failed") {
			const err = turn ? asRecord(turn.error) : null;
			errMsg = readString(err?.message) ?? "Turn failed.";
		}
		if (status === "completed") {
			const text = ctx.finalAgentText.trim();
			const finding = text.length > 0 ? extractFinding(text) : null;
			const pendingFrags = ctx.reviewFragments.join("\n\n").trim();
			const merged = ctx.lastTurnDiff.length > 0 ? ctx.lastTurnDiff : pendingFrags;
			ctx.reviewFragments = [];
			ctx.lastTurnDiff = "";
			return {
				clearProcessStep: true,
				appendAssistant: text.length > 0 ? text : "(No text in agent response.)",
				...(merged.length > 0 ? { reviewPatch: merged } : {}),
				...(finding ? { finding } : {}),
			};
		}
		if (status === "interrupted") {
			return {
				clearProcessStep: true,
				appendStderr: "Turn interrupted.",
			};
		}
		return {
			clearProcessStep: true,
			appendStderr: errMsg || "Turn failed.",
		};
	}

	return {};
}

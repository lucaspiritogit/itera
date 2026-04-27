export type ClientMessage =
	| { kind: "userText"; text: string }
	| { kind: "rpc"; line: string }
	| { kind: "readFile"; path: string; requestId?: string }
	| { kind: "stop" };

export function parseClientMessage(raw: string): ClientMessage | null {
	const trimmed = raw.trim();
	if (!trimmed) {
		return null;
	}
	let obj: unknown;
	try {
		obj = JSON.parse(trimmed) as unknown;
	} catch {
		return { kind: "userText", text: trimmed };
	}
	if (!obj || typeof obj !== "object") {
		return null;
	}
	const o = obj as Record<string, unknown>;
	if (o.op === "userText" && typeof o.text === "string") {
		return { kind: "userText", text: o.text };
	}
	if (o.op === "rpc" && o.line !== undefined) {
		return {
			kind: "rpc",
			line: typeof o.line === "string" ? o.line : JSON.stringify(o.line),
		};
	}
	if (o.op === "readFile" && typeof o.path === "string") {
		return {
			kind: "readFile",
			path: o.path,
			requestId: typeof o.requestId === "string" ? o.requestId : undefined,
		};
	}
	if (o.op === "stop") {
		return { kind: "stop" };
	}
	return { kind: "userText", text: trimmed };
}


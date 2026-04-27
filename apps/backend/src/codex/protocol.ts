export function readThreadId(result: unknown): string | undefined {
	if (!result || typeof result !== "object") {
		return undefined;
	}
	const r = result as Record<string, unknown>;
	const thread = r.thread;
	if (thread && typeof thread === "object") {
		const id = (thread as Record<string, unknown>).id;
		if (typeof id === "string" && id.length > 0) {
			return id;
		}
	}
	const direct = r.threadId;
	if (typeof direct === "string" && direct.length > 0) {
		return direct;
	}
	return undefined;
}


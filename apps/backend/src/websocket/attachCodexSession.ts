import { URL } from "node:url";
import type { WebSocket } from "ws";
import { CodexAppServerSession } from "../codex/session.js";
import type { ModelRuntimeSettings } from "../codex/types.js";
import { CODEX_HOME, DEFAULT_MODEL } from "../config/env.js";
import { handleReadFile } from "../files/readFile.js";
import { parseClientMessage } from "./clientMessage.js";

export async function attachCodexSession(
	ws: WebSocket,
	connectUrl: URL,
): Promise<void> {
	const cwdParam = connectUrl.searchParams.get("cwd");
	const cwd = cwdParam && cwdParam.length > 0 ? cwdParam : process.cwd();
	const model = connectUrl.searchParams.get("model")?.trim() || DEFAULT_MODEL;
	const modelSettings: ModelRuntimeSettings = {
		reasoningEffort:
			(connectUrl.searchParams.get(
				"reasoningEffort",
			) as ModelRuntimeSettings["reasoningEffort"] | null) ?? undefined,
	};

	let session: CodexAppServerSession | null = null;
	let threadId: string | null = null;
	let nextTurnRequestId = 100;

	try {
		session = new CodexAppServerSession(
			cwd,
			CODEX_HOME ? { CODEX_HOME } : {},
		);
		session.setBroadcast((line) => {
			if (ws.readyState === ws.OPEN) {
				ws.send(line);
			}
		});
		threadId = await session.handshake(model, modelSettings);
		ws.send(
			JSON.stringify({
				backend: { ready: true, threadId, cwd, model },
			}),
		);
	} catch (e) {
		const message = e instanceof Error ? e.message : String(e);
		if (ws.readyState === ws.OPEN) {
			ws.send(JSON.stringify({ backend: { error: message } }));
		}
		ws.close();
		session?.dispose();
		return;
	}

	ws.on("message", (data) => {
		const raw = typeof data === "string" ? data : data.toString("utf8");
		const parsed = parseClientMessage(raw);
		if (!parsed || !session || !threadId) {
			return;
		}
		if (parsed.kind === "rpc") {
			try {
				session.writeRawLine(parsed.line);
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				ws.send(JSON.stringify({ backend: { error: message } }));
			}
			return;
		}
		if (parsed.kind === "readFile") {
			void handleReadFile(ws, cwd, parsed);
			return;
		}
		if (parsed.kind === "stop") {
			const id = nextTurnRequestId++;
			try {
				if (!session.interruptTurn(threadId, id)) {
					ws.send(
						JSON.stringify({
							backend: { stderr: "No active turn to stop." },
						}),
					);
				}
			} catch (err) {
				const message = err instanceof Error ? err.message : String(err);
				ws.send(JSON.stringify({ backend: { error: message } }));
			}
			return;
		}
		const id = nextTurnRequestId++;
		try {
			session.sendTurn(threadId, parsed.text, id, modelSettings);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			ws.send(JSON.stringify({ backend: { error: message } }));
		}
	});

	ws.on("close", () => {
		session?.dispose();
	});
}


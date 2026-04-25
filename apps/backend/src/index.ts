import {
	type ChildProcessWithoutNullStreams,
	spawn,
	spawnSync,
} from "node:child_process";
import { promises as fs } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import readline from "node:readline";
import { URL } from "node:url";
import { type WebSocket, WebSocketServer } from "ws";

const MAX_FILE_BYTES = 512 * 1024;

const PORT = Number(process.env.PORT ?? 3847);
const HOST = process.env.HOST?.trim() || "127.0.0.1";
const CODEX_BIN = process.env.CODEX_CLI_PATH?.trim() || "codex";
const DEFAULT_MODEL = process.env.CODEX_MODEL?.trim() || "gpt-5.4-mini";

type ModelRuntimeSettings = {
	reasoningEffort?: "none" | "minimal" | "low" | "medium" | "high" | "xhigh";
};

function killCodexChild(child: ChildProcessWithoutNullStreams): void {
	if (process.platform === "win32" && child.pid !== undefined) {
		try {
			spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
				stdio: "ignore",
			});
			return;
		} catch {
			//
		}
	}
	child.kill("SIGTERM");
}

type Pending = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
};

function readThreadId(result: unknown): string | undefined {
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

class CodexAppServerSession {
	private child: ChildProcessWithoutNullStreams;
	private nextId = 1;
	private readonly pending = new Map<number, Pending>();
	private readonly rl: readline.Interface;
	private broadcast: ((line: string) => void) | null = null;
	private activeTurnId: string | null = null;

	constructor(
		readonly cwd: string,
		env: NodeJS.ProcessEnv,
	) {
		this.child = spawn(CODEX_BIN, ["app-server"], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
			shell: process.platform === "win32",
		}) as ChildProcessWithoutNullStreams;

		this.rl = readline.createInterface({ input: this.child.stdout });
		this.rl.on("line", (line) => this.onLine(line));
		this.child.on("error", (err) => this.failAll(err));
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			if (this.broadcast) {
				this.broadcast(
					JSON.stringify({
						backend: { stderr: chunk },
					}),
				);
			}
		});
	}

	setBroadcast(fn: (line: string) => void): void {
		this.broadcast = fn;
	}

	private failAll(err: Error): void {
		for (const [, p] of this.pending) {
			p.reject(err);
		}
		this.pending.clear();
	}

	private onLine(line: string): void {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line) as Record<string, unknown>;
		} catch {
			if (this.broadcast) {
				this.broadcast(line);
			}
			return;
		}
		const id = msg.id;
		if (typeof id === "number" && this.pending.has(id)) {
			const p = this.pending.get(id);
			if (!p) {
				return;
			}
			this.pending.delete(id);
			if (msg.error && typeof msg.error === "object") {
				const e = (msg.error as Record<string, unknown>).message;
				p.reject(
					new Error(typeof e === "string" ? e : JSON.stringify(msg.error)),
				);
			} else {
				p.resolve(msg.result);
			}
			return;
		}
		this.trackActiveTurn(msg);
		if (this.broadcast) {
			this.broadcast(line);
		}
	}

	private trackActiveTurn(msg: Record<string, unknown>): void {
		if (msg.method === "turn/started") {
			const params = msg.params;
			const turn =
				params && typeof params === "object"
					? (params as Record<string, unknown>).turn
					: null;
			const turnId =
				turn && typeof turn === "object"
					? (turn as Record<string, unknown>).id
					: null;
			if (typeof turnId === "string" && turnId.length > 0) {
				this.activeTurnId = turnId;
			}
			return;
		}
		if (msg.method === "turn/completed" || msg.method === "turn/complete") {
			this.activeTurnId = null;
		}
	}

	private writeLine(obj: unknown): void {
		if (!this.child.stdin.writable) {
			throw new Error("codex stdin is not writable");
		}
		this.child.stdin.write(`${JSON.stringify(obj)}\n`);
	}

	request(method: string, params: unknown): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			this.writeLine({ id, method, params });
		});
	}

	notify(method: string, params?: unknown): void {
		if (params === undefined) {
			this.writeLine({ method });
		} else {
			this.writeLine({ method, params });
		}
	}

	async handshake(model: string, modelSettings: ModelRuntimeSettings): Promise<string> {
		await this.request("initialize", {
			clientInfo: {
				name: "itera_desktop",
				title: "Itera Desktop",
				version: "1.0.0",
			},
			capabilities: {
				experimentalApi: true,
			},
		});
		this.notify("initialized");
		const threadResult = await this.request("thread/start", {
			model,
			cwd: this.cwd,
			config: modelSettings.reasoningEffort
				? { model_reasoning_effort: modelSettings.reasoningEffort }
				: undefined,
		});
		const threadId = readThreadId(threadResult);
		if (!threadId) {
			throw new Error(
				`thread/start did not return a thread id: ${JSON.stringify(threadResult)}`,
			);
		}
		return threadId;
	}

	sendTurn(
		threadId: string,
		text: string,
		requestId: number,
		modelSettings: ModelRuntimeSettings,
	): void {
		this.writeLine({
			id: requestId,
			method: "turn/start",
			params: {
				threadId,
				input: [{ type: "text", text, text_elements: [] }],
				effort: modelSettings.reasoningEffort,
			},
		});
	}

	interruptTurn(threadId: string, requestId: number): boolean {
		if (!this.activeTurnId) {
			return false;
		}
		this.writeLine({
			id: requestId,
			method: "turn/interrupt",
			params: {
				threadId,
				turnId: this.activeTurnId,
			},
		});
		return true;
	}

	writeRawLine(line: string): void {
		if (!this.child.stdin.writable) {
			throw new Error("codex stdin is not writable");
		}
		const payload = line.endsWith("\n") ? line : `${line}\n`;
		this.child.stdin.write(payload);
	}

	dispose(): void {
		this.rl.close();
		this.child.removeAllListeners();
		if (!this.child.killed) {
			killCodexChild(this.child);
		}
	}
}

type ClientMessage =
	| { kind: "userText"; text: string }
	| { kind: "rpc"; line: string }
	| { kind: "readFile"; path: string; requestId?: string }
	| { kind: "stop" };

function parseClientMessage(raw: string): ClientMessage | null {
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

function resolveInsideCwd(cwd: string, requested: string): string | null {
	const cwdAbs = path.resolve(cwd);
	const target = path.resolve(cwdAbs, requested);
	const rel = path.relative(cwdAbs, target);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		return null;
	}
	return target;
}

async function handleReadFile(
	ws: WebSocket,
	cwd: string,
	msg: { path: string; requestId?: string },
): Promise<void> {
	const resolved = resolveInsideCwd(cwd, msg.path);
	const basePayload = {
		path: msg.path,
		requestId: msg.requestId,
	};
	if (!resolved) {
		ws.send(
			JSON.stringify({
				backend: {
					file: {
						...basePayload,
						error: "Path escapes workspace root.",
					},
				},
			}),
		);
		return;
	}
	try {
		const stat = await fs.stat(resolved);
		if (!stat.isFile()) {
			ws.send(
				JSON.stringify({
					backend: {
						file: { ...basePayload, error: "Not a regular file." },
					},
				}),
			);
			return;
		}
		if (stat.size > MAX_FILE_BYTES) {
			ws.send(
				JSON.stringify({
					backend: {
						file: {
							...basePayload,
							error: `File too large (${stat.size} bytes, max ${MAX_FILE_BYTES}).`,
						},
					},
				}),
			);
			return;
		}
		const content = await fs.readFile(resolved, "utf8");
		ws.send(
			JSON.stringify({
				backend: {
					file: { ...basePayload, size: stat.size, content },
				},
			}),
		);
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		ws.send(
			JSON.stringify({
				backend: { file: { ...basePayload, error: message } },
			}),
		);
	}
}

const httpServer = createServer((req, res) => {
	if (req.url === "/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true }));
		return;
	}
	res.writeHead(404);
	res.end();
});

const wss = new WebSocketServer({ noServer: true });

httpServer.on("upgrade", (req, socket, head) => {
	const host = req.headers.host ?? `127.0.0.1:${PORT}`;
	const url = new URL(req.url ?? "/", `http://${host}`);
	if (url.pathname !== "/codex") {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		void attachCodexSession(ws, url);
	});
});

async function attachCodexSession(
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
	const codexHome = process.env.CODEX_HOME?.trim();

	let session: CodexAppServerSession | null = null;
	let threadId: string | null = null;
	let nextTurnRequestId = 100;

	try {
		session = new CodexAppServerSession(
			cwd,
			codexHome ? { CODEX_HOME: codexHome } : {},
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

httpServer.listen(PORT, HOST, () => {
	console.log(`backend http://${HOST}:${PORT} (WebSocket /codex)`);
});

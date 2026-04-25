import {
	type ChildProcessWithoutNullStreams,
	spawn,
	spawnSync,
} from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { ipcMain, type WebContents } from "electron";
import type { ModelRuntimeSettings } from "../features/agent-session/model/modelRuntimeSettings";

const MAX_FILE_BYTES = 512 * 1024;
const CODEX_BIN = process.env.CODEX_CLI_PATH?.trim() || "codex";
const DEFAULT_MODEL = process.env.CODEX_MODEL?.trim() || "gpt-5.4-mini";

type Pending = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
};

type ClientMessage =
	| { kind: "userText"; text: string }
	| { kind: "rpc"; line: string }
	| { kind: "readFile"; path: string; requestId?: string }
	| { kind: "stop" };

type ConnectInput = {
	id: string;
	cwd?: string;
	model?: string;
	modelSettings?: ModelRuntimeSettings;
};

function sendToRenderer(
	owner: WebContents,
	channel: "message" | "error" | "close",
	id: string,
	payload?: unknown,
): void {
	if (!owner.isDestroyed()) {
		owner.send(`codex:${channel}`, { id, payload });
	}
}

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

class CodexStdioSession {
	private child: ChildProcessWithoutNullStreams;
	private readonly rl: readline.Interface;
	private nextId = 1;
	private nextTurnRequestId = 100;
	private readonly pending = new Map<number, Pending>();
	private threadId: string | null = null;
	private activeTurnId: string | null = null;
	private disposed = false;

	constructor(
		private readonly id: string,
		private readonly owner: WebContents,
		private readonly cwd: string,
		private readonly model: string,
		private readonly modelSettings: ModelRuntimeSettings,
		env: NodeJS.ProcessEnv,
		private readonly onClose: () => void,
	) {
		this.child = spawn(CODEX_BIN, ["app-server"], {
			cwd,
			env: { ...process.env, ...env },
			stdio: ["pipe", "pipe", "pipe"],
			shell: process.platform === "win32",
		}) as ChildProcessWithoutNullStreams;

		this.rl = readline.createInterface({ input: this.child.stdout });
		this.rl.on("line", (line) => this.onLine(line));
		this.child.on("error", (err) => this.fail(err));
		this.child.on("close", () => {
			this.failAll(new Error("codex stdio process closed"));
			sendToRenderer(this.owner, "close", this.id);
			this.onClose();
		});
		this.child.stderr.setEncoding("utf8");
		this.child.stderr.on("data", (chunk: string) => {
			this.sendBackend({ stderr: chunk });
		});
	}

	async start(): Promise<void> {
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
			model: this.model,
			cwd: this.cwd,
			config: this.modelSettings.reasoningEffort
				? { model_reasoning_effort: this.modelSettings.reasoningEffort }
				: undefined,
		});
		const threadId = readThreadId(threadResult);
		if (!threadId) {
			throw new Error(
				`thread/start did not return a thread id: ${JSON.stringify(threadResult)}`,
			);
		}
		this.threadId = threadId;
		this.sendBackend({ ready: true, threadId, cwd: this.cwd, model: this.model });
	}

	handleRaw(raw: string): void {
		const parsed = parseClientMessage(raw);
		if (!parsed) {
			return;
		}
		if (parsed.kind === "rpc") {
			this.writeRawLine(parsed.line);
			return;
		}
		if (parsed.kind === "readFile") {
			void this.handleReadFile(parsed);
			return;
		}
		if (parsed.kind === "stop") {
			this.stopTurn();
			return;
		}
		this.sendTurn(parsed.text);
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.rl.close();
		this.child.removeAllListeners();
		if (!this.child.killed) {
			killCodexChild(this.child);
		}
		this.failAll(new Error("codex stdio session disposed"));
	}

	private onLine(line: string): void {
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(line) as Record<string, unknown>;
		} catch {
			this.sendRaw(line);
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
		this.sendRaw(line);
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

	private request(method: string, params: unknown): Promise<unknown> {
		const id = this.nextId++;
		return new Promise((resolve, reject) => {
			this.pending.set(id, { resolve, reject });
			try {
				this.writeLine({ id, method, params });
			} catch (err) {
				this.pending.delete(id);
				reject(err);
			}
		});
	}

	private notify(method: string, params?: unknown): void {
		if (params === undefined) {
			this.writeLine({ method });
		} else {
			this.writeLine({ method, params });
		}
	}

	private sendTurn(text: string): void {
		if (!this.threadId) {
			this.sendBackend({ error: "Codex thread is not ready yet." });
			return;
		}
		this.writeLine({
			id: this.nextTurnRequestId++,
			method: "turn/start",
			params: {
				threadId: this.threadId,
				input: [{ type: "text", text, text_elements: [] }],
				effort: this.modelSettings.reasoningEffort,
			},
		});
	}

	private stopTurn(): void {
		if (!this.threadId || !this.activeTurnId) {
			this.sendBackend({ stderr: "No active turn to stop." });
			return;
		}
		this.writeLine({
			id: this.nextTurnRequestId++,
			method: "turn/interrupt",
			params: {
				threadId: this.threadId,
				turnId: this.activeTurnId,
			},
		});
	}

	private async handleReadFile(msg: {
		path: string;
		requestId?: string;
	}): Promise<void> {
		const resolved = resolveInsideCwd(this.cwd, msg.path);
		const basePayload = {
			path: msg.path,
			requestId: msg.requestId,
		};
		if (!resolved) {
			this.sendBackend({
				file: { ...basePayload, error: "Path escapes workspace root." },
			});
			return;
		}
		try {
			const stat = await fs.stat(resolved);
			if (!stat.isFile()) {
				this.sendBackend({
					file: { ...basePayload, error: "Not a regular file." },
				});
				return;
			}
			if (stat.size > MAX_FILE_BYTES) {
				this.sendBackend({
					file: {
						...basePayload,
						error: `File too large (${stat.size} bytes, max ${MAX_FILE_BYTES}).`,
					},
				});
				return;
			}
			const content = await fs.readFile(resolved, "utf8");
			this.sendBackend({
				file: { ...basePayload, size: stat.size, content },
			});
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			this.sendBackend({ file: { ...basePayload, error: message } });
		}
	}

	private writeLine(obj: unknown): void {
		this.writeRawLine(JSON.stringify(obj));
	}

	private writeRawLine(line: string): void {
		if (!this.child.stdin.writable) {
			throw new Error("codex stdin is not writable");
		}
		const payload = line.endsWith("\n") ? line : `${line}\n`;
		this.child.stdin.write(payload);
	}

	private sendRaw(raw: string): void {
		sendToRenderer(this.owner, "message", this.id, raw);
	}

	private sendBackend(payload: Record<string, unknown>): void {
		this.sendRaw(JSON.stringify({ backend: payload }));
	}

	private fail(err: Error): void {
		this.failAll(err);
		this.sendBackend({ error: err.message });
		sendToRenderer(this.owner, "error", this.id, err.message);
	}

	private failAll(err: Error): void {
		for (const [, p] of this.pending) {
			p.reject(err);
		}
		this.pending.clear();
	}
}

const sessions = new Map<string, CodexStdioSession>();

export function registerCodexStdioIpc(): void {
	ipcMain.handle("codex:connect", (event, input: ConnectInput) => {
		const id = input.id;
		if (!id) {
			throw new Error("Missing Codex session id.");
		}
		sessions.get(id)?.dispose();
		const cwd = input.cwd && input.cwd.length > 0 ? input.cwd : process.cwd();
		const model = input.model?.trim() || DEFAULT_MODEL;
		const modelSettings = input.modelSettings ?? {};
		const codexHome = process.env.CODEX_HOME?.trim();
		const session = new CodexStdioSession(
			id,
			event.sender,
			cwd,
			model,
			modelSettings,
			codexHome ? { CODEX_HOME: codexHome } : {},
			() => sessions.delete(id),
		);
		sessions.set(id, session);
		event.sender.once("destroyed", () => {
			session.dispose();
			sessions.delete(id);
		});
		void session.start().catch((err) => {
			const message = err instanceof Error ? err.message : String(err);
			sendToRenderer(
				event.sender,
				"message",
				id,
				JSON.stringify({ backend: { error: message } }),
			);
			sendToRenderer(event.sender, "error", id, message);
			session.dispose();
			sessions.delete(id);
			sendToRenderer(event.sender, "close", id);
		});
		return { id };
	});

	ipcMain.on("codex:send", (_event, input: { id: string; raw: string }) => {
		const session = sessions.get(input.id);
		if (!session) {
			return;
		}
		try {
			session.handleRaw(input.raw);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			sendToRenderer(
				_event.sender,
				"message",
				input.id,
				JSON.stringify({ backend: { error: message } }),
			);
		}
	});

	ipcMain.on("codex:close", (_event, input: { id: string }) => {
		const session = sessions.get(input.id);
		if (!session) {
			return;
		}
		session.dispose();
		sessions.delete(input.id);
		sendToRenderer(_event.sender, "close", input.id);
	});
}

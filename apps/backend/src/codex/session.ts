import {
	type ChildProcessWithoutNullStreams,
	spawn,
} from "node:child_process";
import readline from "node:readline";
import { CODEX_BIN } from "../config/env.js";
import { killCodexChild } from "./process.js";
import { readThreadId } from "./protocol.js";
import type { ModelRuntimeSettings } from "./types.js";

type Pending = {
	resolve: (value: unknown) => void;
	reject: (err: Error) => void;
};

export class CodexAppServerSession {
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


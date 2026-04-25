import { contextBridge, ipcRenderer } from "electron";
import type { ModelRuntimeSettings } from "../features/agent-session/model/modelRuntimeSettings";

type CodexConnectInput = {
	cwd: string;
	model?: string;
	modelSettings?: ModelRuntimeSettings;
};

type CodexEventHandlers = {
	onOpen?: () => void;
	onMessage?: (raw: string) => void;
	onError?: (error?: unknown) => void;
	onClose?: () => void;
};

function isSessionPayload(
	value: unknown,
	id: string,
): value is { id: string; payload?: unknown } {
	return (
		!!value &&
		typeof value === "object" &&
		(value as Record<string, unknown>).id === id
	);
}

function createSessionId(): string {
	if (globalThis.crypto?.randomUUID) {
		return globalThis.crypto.randomUUID();
	}
	return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

contextBridge.exposeInMainWorld("desktop", {
	openProjectFolder: () =>
		ipcRenderer.invoke("dialog:openProjectFolder") as Promise<string | null>,
	platform: process.platform,
	codex: {
		connect(input: CodexConnectInput, handlers: CodexEventHandlers = {}) {
			const id = createSessionId();
			const onMessage = (_event: unknown, value: unknown) => {
				if (!isSessionPayload(value, id)) {
					return;
				}
				if (typeof value.payload === "string") {
					handlers.onMessage?.(value.payload);
				}
			};
			const onError = (_event: unknown, value: unknown) => {
				if (!isSessionPayload(value, id)) {
					return;
				}
				handlers.onError?.(value.payload);
			};
			const onClose = (_event: unknown, value: unknown) => {
				if (!isSessionPayload(value, id)) {
					return;
				}
				ipcRenderer.removeListener("codex:message", onMessage);
				ipcRenderer.removeListener("codex:error", onError);
				ipcRenderer.removeListener("codex:close", onClose);
				handlers.onClose?.();
			};
			ipcRenderer.on("codex:message", onMessage);
			ipcRenderer.on("codex:error", onError);
			ipcRenderer.on("codex:close", onClose);
			void ipcRenderer
				.invoke("codex:connect", { id, ...input })
				.then(() => handlers.onOpen?.())
				.catch((err: unknown) => {
					handlers.onError?.(err);
					onClose({}, { id });
				});
			return id;
		},
		send(id: string, raw: string) {
			ipcRenderer.send("codex:send", { id, raw });
		},
		close(id: string) {
			ipcRenderer.send("codex:close", { id });
		},
	},
});

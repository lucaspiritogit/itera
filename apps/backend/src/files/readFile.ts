import { promises as fs } from "node:fs";
import type { WebSocket } from "ws";
import { resolveInsideCwd } from "./workspacePath.js";

const MAX_FILE_BYTES = 512 * 1024;

type ReadFileMessage = {
	path: string;
	requestId?: string;
};

export async function handleReadFile(
	ws: WebSocket,
	cwd: string,
	msg: ReadFileMessage,
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


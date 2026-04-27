import { createServer } from "node:http";
import { URL } from "node:url";
import { WebSocketServer } from "ws";
import { PORT } from "../config/env.js";
import { attachCodexSession } from "../websocket/attachCodexSession.js";

export function createBackendServer() {
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

	return httpServer;
}


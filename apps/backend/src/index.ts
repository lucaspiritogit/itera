import { HOST, PORT } from "./config/env.js";
import { createBackendServer } from "./http/server.js";

const httpServer = createBackendServer();

httpServer.listen(PORT, HOST, () => {
	console.log(`backend http://${HOST}:${PORT} (WebSocket /codex)`);
});


import {
	type ChildProcessWithoutNullStreams,
	spawnSync,
} from "node:child_process";

export function killCodexChild(child: ChildProcessWithoutNullStreams): void {
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


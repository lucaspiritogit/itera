import { describe, expect, it } from "vitest";
import { buildBackendWsUrl } from "./defaults";

describe("default agent session ports", () => {
	it("serializes model runtime settings in the backend websocket URL", () => {
		expect(
			buildBackendWsUrl("ws://127.0.0.1:3847/codex", "/repo", "gpt-5.4", {
				reasoningEffort: "high",
			}),
		).toBe(
			"ws://127.0.0.1:3847/codex?cwd=%2Frepo&model=gpt-5.4&reasoningEffort=high",
		);
	});
});

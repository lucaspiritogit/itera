import { describe, expect, it } from "vitest";
import { createSessionLifecycleController } from "./sessionLifecycle";

describe("session lifecycle controller", () => {
	it("connects on first non-empty cwd and reconnects on key changes", () => {
		const calls: unknown[] = [];
		const controller = createSessionLifecycleController({
			connect(input) {
				calls.push({ type: "connect", input });
			},
			disconnect() {
				calls.push({ type: "disconnect" });
			},
		});

		controller.update({ cwd: "", model: "m1", reconnectToken: 0 });
		controller.update({ cwd: "/repo", model: "m1", reconnectToken: 0 });
		controller.update({ cwd: "/repo", model: "m1", reconnectToken: 0 });
		controller.update({ cwd: "/repo", model: "m2", reconnectToken: 0 });
		controller.update({ cwd: "/repo", model: "m2", reconnectToken: 1 });

		expect(calls).toEqual([
			{ type: "connect", input: { cwd: "/repo", model: "m1" } },
			{ type: "disconnect" },
			{ type: "connect", input: { cwd: "/repo", model: "m2" } },
			{ type: "disconnect" },
			{ type: "connect", input: { cwd: "/repo", model: "m2" } },
		]);
	});

	it("reconnects and forwards model runtime settings when thinking changes", () => {
		const calls: unknown[] = [];
		const controller = createSessionLifecycleController({
			connect(input) {
				calls.push({ type: "connect", input });
			},
			disconnect() {
				calls.push({ type: "disconnect" });
			},
		});

		controller.update({
			cwd: "/repo",
			model: "gpt-5.4",
			modelSettings: { reasoningEffort: "low" },
			reconnectToken: 0,
		});
		controller.update({
			cwd: "/repo",
			model: "gpt-5.4",
			modelSettings: { reasoningEffort: "high" },
			reconnectToken: 0,
		});

		expect(calls).toEqual([
			{
				type: "connect",
				input: {
					cwd: "/repo",
					model: "gpt-5.4",
					modelSettings: { reasoningEffort: "low" },
				},
			},
			{ type: "disconnect" },
			{
				type: "connect",
				input: {
					cwd: "/repo",
					model: "gpt-5.4",
					modelSettings: { reasoningEffort: "high" },
				},
			},
		]);
	});

	it("disconnects when cwd becomes empty and on dispose", () => {
		const calls: string[] = [];
		const controller = createSessionLifecycleController({
			connect(input) {
				calls.push(`connect:${input.cwd}:${input.model ?? ""}`);
			},
			disconnect() {
				calls.push("disconnect");
			},
		});

		controller.update({ cwd: "/repo", model: "m1", reconnectToken: 0 });
		controller.update({ cwd: "   ", model: "m1", reconnectToken: 0 });
		controller.update({ cwd: "/repo", model: "m1", reconnectToken: 1 });
		controller.dispose();

		expect(calls).toEqual([
			"connect:/repo:m1",
			"disconnect",
			"connect:/repo:m1",
			"disconnect",
		]);
	});
});

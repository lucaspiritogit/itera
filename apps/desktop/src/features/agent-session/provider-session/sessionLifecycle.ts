export type SessionLifecycleInput = {
	cwd: string;
	model?: string;
	reconnectToken: string | number;
};

export type SessionLifecyclePort = {
	connect(input: { cwd: string; model?: string }): void;
	disconnect(): void;
};

export type SessionLifecycleController = {
	update(input: SessionLifecycleInput): void;
	dispose(): void;
};

function lifecycleKey(input: SessionLifecycleInput): string {
	return `${input.cwd}\u0000${input.model ?? ""}\u0000${String(input.reconnectToken)}`;
}

export function createSessionLifecycleController(
	port: SessionLifecyclePort,
): SessionLifecycleController {
	let previousKey: string | null = null;
	let connected = false;

	return {
		update(input) {
			const nextCwd = input.cwd.trim();
			if (nextCwd.length === 0) {
				if (connected) {
					port.disconnect();
					connected = false;
				}
				previousKey = null;
				return;
			}
			const nextKey = lifecycleKey(input);
			if (previousKey === nextKey) {
				return;
			}
			if (connected) {
				port.disconnect();
			}
			port.connect({ cwd: input.cwd, model: input.model });
			connected = true;
			previousKey = nextKey;
		},
		dispose() {
			if (connected) {
				port.disconnect();
				connected = false;
			}
			previousKey = null;
		},
	};
}

export {};

import type { ModelRuntimeSettings } from "../../features/agent-session/model/modelRuntimeSettings";

declare global {
	interface Window {
		desktop?: {
			openProjectFolder?: () => Promise<string | null>;
			platform: string;
			codex?: {
				connect(
					input: {
						cwd: string;
						model?: string;
						modelSettings?: ModelRuntimeSettings;
					},
					handlers?: {
						onOpen?: () => void;
						onMessage?: (raw: string) => void;
						onError?: (error?: unknown) => void;
						onClose?: () => void;
					},
				): string;
				send(id: string, raw: string): void;
				close(id: string): void;
			};
		};
	}
}

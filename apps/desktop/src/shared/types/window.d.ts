export {};

declare global {
	interface Window {
		desktop?: {
			openProjectFolder?: () => Promise<string | null>;
			platform: string;
			codex?: {
				connect(
					input: { cwd: string; model?: string },
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

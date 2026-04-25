export {};

declare global {
	interface Window {
		desktop?: {
			openProjectFolder?: () => Promise<string | null>;
			platform: string;
		};
	}
}

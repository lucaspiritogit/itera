export type FileLoadState =
	| { status: "idle" }
	| { status: "loading" }
	| { status: "ready"; content: string; size?: number }
	| { status: "error"; error: string };

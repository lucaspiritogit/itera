export type ModelReasoningEffort =
	| "none"
	| "minimal"
	| "low"
	| "medium"
	| "high"
	| "xhigh";

export type ModelRuntimeSettings = {
	reasoningEffort?: ModelReasoningEffort;
};

export type AgentModelConnectionInput = {
	cwd: string;
	model?: string;
	modelSettings?: ModelRuntimeSettings;
};

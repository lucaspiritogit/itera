import type { ModelReasoningEffort } from "../model/modelRuntimeSettings";

export type ModelThinkingLevel = Extract<
	ModelReasoningEffort,
	"low" | "medium" | "high"
>;

export type ModelId = "gpt-5.4-mini" | "gpt-5.4" | "gpt-5.3-codex";

export type ModelOption = {
	id: ModelId;
	label: string;
	provider: string;
	thinkingLevel: ModelThinkingLevel;
};

export const THINKING_LEVEL_OPTIONS: readonly ModelThinkingLevel[] = [
	"low",
	"medium",
	"high",
];

export const MODEL_OPTIONS: ModelOption[] = [
	{
		id: "gpt-5.4-mini",
		label: "GPT-5.4 Mini",
		provider: "OpenAI",
		thinkingLevel: "low",
	},
	{
		id: "gpt-5.4",
		label: "GPT-5.4",
		provider: "OpenAI",
		thinkingLevel: "high",
	},
	{
		id: "gpt-5.3-codex",
		label: "GPT-5.3 Codex",
		provider: "OpenAI",
		thinkingLevel: "medium",
	},
];

export const DEFAULT_MODEL: ModelId = "gpt-5.4-mini";

export function buildModelThinkingLevelDefaults(): Record<ModelId, ModelThinkingLevel> {
	return MODEL_OPTIONS.reduce<Record<ModelId, ModelThinkingLevel>>(
		(accumulator, option) => {
			accumulator[option.id] = option.thinkingLevel;
			return accumulator;
		},
		{
			"gpt-5.4-mini": "low",
			"gpt-5.4": "high",
			"gpt-5.3-codex": "medium",
		},
	);
}

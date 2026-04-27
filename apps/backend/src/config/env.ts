export const PORT = Number(process.env.PORT ?? 3847);
export const HOST = process.env.HOST?.trim() || "127.0.0.1";
export const CODEX_BIN = process.env.CODEX_CLI_PATH?.trim() || "codex";
export const DEFAULT_MODEL = process.env.CODEX_MODEL?.trim() || "gpt-5.4-mini";
export const CODEX_HOME = process.env.CODEX_HOME?.trim();


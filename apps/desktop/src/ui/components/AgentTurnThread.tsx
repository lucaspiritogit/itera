import type { ProcessStep } from "../../integrations/codex/codexWire";
import { AgentDiffReview } from "./AgentDiffReview";
import type { ReviewDiffStyle } from "./ChangeReviewQueue";

export type UserTurn = {
	id: string;
	prompt: string;
	patch: string | null;
	activeStep: ProcessStep | null;
	assistantMessages: string[];
	streamingAssistant: string;
};

export type LogMessage = {
	role: "system" | "stderr" | "assistant";
	text: string;
};

export type AgentTurnThreadProps = {
	turns: UserTurn[];
	diffStyle?: ReviewDiffStyle;
};

export function AgentTurnThread({
	turns,
	diffStyle = "unified",
}: AgentTurnThreadProps) {
	return (
		<div className="flex w-full max-w-5xl flex-col gap-8 pb-6">
			{turns.map((turn) => {
				const showAssistant = turn.assistantMessages.length > 0 || turn.streamingAssistant.length > 0;
				const active = turn.activeStep;
				const showActiveChip =
					Boolean(active) &&
					turn.assistantMessages.length === 0 &&
					turn.streamingAssistant.length === 0;

				return (
					<section
						key={turn.id}
						className="flex flex-col gap-3 border-b border-neutral-900 pb-8 last:border-b-0 last:pb-0"
					>
						<div className="flex justify-center">
							<div className="max-w-[min(100%,42rem)] rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm leading-relaxed text-neutral-100 shadow-xl shadow-black/20">
								{turn.prompt}
							</div>
						</div>
						{showActiveChip && active ? (
							<div
								className="mx-auto flex w-full max-w-[min(100%,42rem)] items-start gap-2 rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2"
								aria-live="polite"
							>
								<span
									className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-sky-300"
									aria-hidden
								/>
								<div className="min-w-0 flex-1">
									<p className="m-0 text-xs font-medium text-sky-100">{active.title}</p>
									{active.detail ? (
										<p className="m-0 mt-0.5 break-all font-mono text-[10px] text-sky-200/80">
											{active.detail}
										</p>
									) : null}
								</div>
							</div>
						) : null}
						{showAssistant ? (
							<div className="mx-auto flex w-full max-w-[min(100%,42rem)] flex-col gap-2">
								{turn.assistantMessages.map((message, index) => (
									<div
										key={`${turn.id}-assistant-${index}`}
										className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3"
									>
										<p className="m-0 text-xs font-semibold uppercase tracking-wide text-emerald-200/90">
											Assistant
										</p>
										<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-emerald-100" aria-live="polite">
											{message}
										</p>
									</div>
								))}
								{turn.streamingAssistant.length > 0 ? (
									<div className="flex flex-col gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3">
										<p className="m-0 text-xs font-semibold uppercase tracking-wide text-emerald-200/90">
											Assistant
										</p>
										<p className="m-0 whitespace-pre-wrap text-sm leading-relaxed text-emerald-100" aria-live="polite">
											{turn.streamingAssistant}
										</p>
									</div>
								) : null}
							</div>
						) : null}
						{turn.patch && turn.patch.trim().length > 0 ? (
							<div className="flex w-full flex-col">
								<AgentDiffReview
									patch={turn.patch}
									cacheKeyPrefix={turn.id}
									diffStyle={diffStyle}
								/>
							</div>
						) : null}
					</section>
				);
			})}
		</div>
	);
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
	createAgentSessionOrchestrator,
} from "./agentSession/orchestrator";
import { createDefaultAgentSessionPorts } from "./agentSession/defaults";
import type { AgentSessionSnapshot } from "./agentSession/types";
import {
	AgentPromptInput,
	ReviewPromptInput,
} from "./components/AgentPromptInput";
import {
	ChangeReviewQueue,
	type ReviewDiffStyle,
} from "./components/ChangeReviewQueue";
import { ExplorationFinding } from "./components/ExplorationFinding";
import "./index.css";

const DEFAULT_CWD = "";
const DEFAULT_MODEL = "gpt-5.4-mini";
const CODEX_ICON_URL = new URL("../assets/codex.svg", import.meta.url).href;

const AGENT_OPTIONS = [
	{
		id: "codex",
		label: "Codex",
		iconUrl: CODEX_ICON_URL,
	},
] as const;

const MODEL_OPTIONS = [
	{ id: "gpt-5.4-mini", label: "GPT-5.4 Mini" },
	{ id: "gpt-5.4", label: "GPT-5.4" },
	{ id: "gpt-5.3-codex", label: "GPT-5.3 Codex" },
] as const;

type AgentId = (typeof AGENT_OPTIONS)[number]["id"];
type ModelId = (typeof MODEL_OPTIONS)[number]["id"];

function isEditableTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) {
		return false;
	}
	if (target.isContentEditable) {
		return true;
	}
	const tag = target.tagName.toLowerCase();
	return tag === "input" || tag === "textarea" || tag === "select";
}

function promptPlaceholder(snapshot: AgentSessionSnapshot): string {
	if (snapshot.pendingReviewDecision) {
		return "Resolve all file-change decisions before sending the next instruction.";
	}
	if (snapshot.pendingExplorationDecision) {
		return "Review the exploration finding before sending the next instruction.";
	}
	if (snapshot.hasActiveTurn) {
		return "Agent is working…";
	}
	if (snapshot.status === "ready") {
		return snapshot.mode === "editing"
			? "What should we change next?"
			: "What should we explore?";
	}
	return snapshot.status === "connecting"
		? "Waiting for backend…"
		: "Connect to backend to send";
}

function reviewTargetLabel(snapshot: AgentSessionSnapshot): string {
	if (snapshot.pendingExplorationDecision && snapshot.finding) {
		return snapshot.finding.file;
	}
	const batch = snapshot.reviewBatch;
	if (snapshot.pendingReviewDecision && batch) {
		const active =
			batch.cards[Math.min(Math.max(batch.activeIndex, 0), batch.cards.length - 1)];
		return active?.filePath ?? "Selected change";
	}
	return "Selected review item";
}

function AgentIcon({ iconUrl, label }: { iconUrl: string; label: string }) {
	return (
		<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-neutral-800 bg-neutral-100">
			<img src={iconUrl} alt="" aria-hidden className="h-3.5 w-3.5" />
			<span className="sr-only">{label}</span>
		</span>
	);
}

function AgentSelector({
	value,
	disabled,
	onChange,
}: {
	value: AgentId;
	disabled: boolean;
	onChange: (value: AgentId) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected =
		AGENT_OPTIONS.find((option) => option.id === value) ?? AGENT_OPTIONS[0];

	return (
		<div className="relative min-w-0">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex h-9 min-w-32 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 text-xs text-neutral-100 transition enabled:cursor-pointer enabled:hover:border-cyan-400 disabled:opacity-60"
			>
				<AgentIcon iconUrl={selected.iconUrl} label={selected.label} />
				<span className="truncate">{selected.label}</span>
				<span className="ml-auto text-neutral-500" aria-hidden>
					^
				</span>
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-40 rounded-md border border-neutral-800 bg-black p-1 shadow-xl shadow-black/40"
				>
					{AGENT_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							role="option"
							aria-selected={option.id === value}
							onClick={() => {
								onChange(option.id);
								setOpen(false);
							}}
							className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-neutral-100 enabled:cursor-pointer enabled:hover:bg-neutral-900"
						>
							<AgentIcon iconUrl={option.iconUrl} label={option.label} />
							<span>{option.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

function ModelSelector({
	value,
	disabled,
	onChange,
}: {
	value: ModelId;
	disabled: boolean;
	onChange: (value: ModelId) => void;
}) {
	const [open, setOpen] = useState(false);
	const selected =
		MODEL_OPTIONS.find((option) => option.id === value) ?? MODEL_OPTIONS[0];

	return (
		<div className="relative min-w-0">
			<button
				type="button"
				onClick={() => setOpen((current) => !current)}
				disabled={disabled}
				aria-haspopup="listbox"
				aria-expanded={open}
				className="flex h-9 min-w-44 items-center gap-2 rounded-md border border-neutral-800 bg-neutral-950 px-2.5 text-xs text-neutral-100 transition enabled:cursor-pointer enabled:hover:border-cyan-400 disabled:opacity-60"
			>
				<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-cyan-400/40 bg-cyan-400/10 text-[10px] text-cyan-100">
					M
				</span>
				<span className="truncate">{selected.label}</span>
				<span className="ml-auto text-neutral-500" aria-hidden>
					^
				</span>
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-52 rounded-md border border-neutral-800 bg-black p-1 shadow-xl shadow-black/40"
				>
					{MODEL_OPTIONS.map((option) => (
						<button
							key={option.id}
							type="button"
							role="option"
							aria-selected={option.id === value}
							onClick={() => {
								onChange(option.id);
								setOpen(false);
							}}
							className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs enabled:cursor-pointer enabled:hover:bg-neutral-900 ${
								option.id === value ? "text-cyan-100" : "text-neutral-300"
							}`}
						>
							<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-cyan-400/40 bg-cyan-400/10 text-[10px] text-cyan-100">
								M
							</span>
							<span>{option.label}</span>
						</button>
					))}
				</div>
			) : null}
		</div>
	);
}

const App = () => {
	const [cwd, setCwd] = useState(DEFAULT_CWD);
	const [selectedAgent, setSelectedAgent] = useState<AgentId>("codex");
	const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
	const [connectNonce, setConnectNonce] = useState(0);
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
	const [reviewDiffStyle, setReviewDiffStyle] =
		useState<ReviewDiffStyle>("unified");
	const session = useMemo(
		() =>
			createAgentSessionOrchestrator({
				ports: createDefaultAgentSessionPorts(
					import.meta.env.VITE_CODEX_BACKEND_WS,
				),
				initial: { cwd: DEFAULT_CWD, mode: "exploration" },
			}),
		[],
	);
	const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
	const chatEndRef = useRef<HTMLDivElement | null>(null);

	const scrollToChatEnd = useCallback(() => {
		const node = chatEndRef.current;
		if (!node) {
			return;
		}
		window.requestAnimationFrame(() => {
			node.scrollIntoView({
				behavior: "smooth",
				block: "end",
				inline: "nearest",
			});
		});
	}, []);

	const openProjectFolder = useCallback(async () => {
		const selected = await window.desktop?.openProjectFolder?.();
		if (!selected) {
			return;
		}
		setCwd(selected);
	}, []);

	useEffect(() => {
		return session.subscribe((_event, nextSnapshot) => {
			setSnapshot(nextSnapshot);
		});
	}, [session]);

	useEffect(() => {
		if (cwd.trim().length === 0) {
			session.disconnect();
			return;
		}
		session.connect({ cwd, model: selectedModel });
		return () => {
			session.disconnect();
		};
	}, [connectNonce, cwd, selectedModel, session]);

	useEffect(() => {
		if (
			snapshot.hasActiveTurn ||
			!snapshot.reviewBatch ||
			snapshot.reviewBatch.cards.length === 0
		) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			const isAcceptShortcut =
				event.key === "Enter" && (event.metaKey || event.ctrlKey);
			if (isEditableTarget(event.target) && !isAcceptShortcut) {
				return;
			}
			if (event.key === "ArrowRight") {
				event.preventDefault();
				session.moveReviewCursor(1);
				return;
			}
			if (event.key === "ArrowLeft") {
				event.preventDefault();
				session.moveReviewCursor(-1);
				return;
			}
			const active = snapshot.reviewBatch.cards[snapshot.reviewBatch.activeIndex];
			if (!active) {
				return;
			}
			if (isAcceptShortcut) {
				event.preventDefault();
				session.setReviewDecision(active.id, "accepted");
				return;
			}
			if (event.key.toLowerCase() === "d") {
				event.preventDefault();
				session.setReviewDecision(active.id, "denied");
				return;
			}
			if (event.key.toLowerCase() === "v") {
				event.preventDefault();
				setReviewDiffStyle((current) =>
					current === "unified" ? "split" : "unified",
				);
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [session, snapshot.hasActiveTurn, snapshot.reviewBatch]);

	useEffect(() => {
		if (snapshot.hasActiveTurn || !snapshot.pendingExplorationDecision) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			const isAcceptShortcut =
				event.key === "Enter" && (event.metaKey || event.ctrlKey);
			if (isEditableTarget(event.target) && !isAcceptShortcut) {
				return;
			}
			if (isAcceptShortcut) {
				event.preventDefault();
				session.resolveFinding("approve");
				return;
			}
			if (event.key.toLowerCase() === "d") {
				event.preventDefault();
				session.resolveFinding("dismiss");
			}
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [session, snapshot.hasActiveTurn, snapshot.pendingExplorationDecision]);

	useEffect(() => {
		if (!snapshot.hasActiveTurn) {
			return;
		}
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key !== "Escape") {
				return;
			}
			event.preventDefault();
			session.stopTurn();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => {
			window.removeEventListener("keydown", onKeyDown);
		};
	}, [session, snapshot.hasActiveTurn]);

	useEffect(() => {
		scrollToChatEnd();
	}, [snapshot.activeStep, snapshot.chatItems, snapshot.hasActiveTurn, scrollToChatEnd]);

	const latestSystem = snapshot.systemMessages[snapshot.systemMessages.length - 1];
	const isReviewing =
		snapshot.pendingExplorationDecision || snapshot.pendingReviewDecision;

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden">
			<div className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden">
				{isSidebarCollapsed ? (
					<div className="flex shrink-0 bg-black p-2">
						<button
							type="button"
							onClick={() => setIsSidebarCollapsed(false)}
							aria-label="Open session sidebar"
							title="Open session sidebar"
							className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-sm font-medium text-cyan-200 enabled:cursor-pointer enabled:hover:border-cyan-400 enabled:hover:bg-neutral-900"
						>
							›
						</button>
					</div>
				) : (
					<aside className="flex min-h-0 w-[min(100%,18rem)] shrink-0 flex-col gap-3 overflow-hidden bg-black pr-3">
						<div className="flex items-center justify-end">
							<button
								type="button"
								onClick={() => setIsSidebarCollapsed(true)}
								aria-label="Close session sidebar"
								title="Close session sidebar"
								className="flex h-8 w-8 items-center justify-center rounded-md border border-neutral-700 bg-neutral-950 text-sm text-cyan-200 enabled:cursor-pointer enabled:hover:border-cyan-400 enabled:hover:bg-neutral-900"
							>
								‹
							</button>
						</div>
						<p className="m-0 text-xs text-neutral-400">
							Status: {snapshot.status} · Mode: {snapshot.mode} · {import.meta.env.VITE_CODEX_BACKEND_WS}
						</p>
						<div className="flex flex-col gap-2 text-sm">
							<label className="flex flex-col gap-1">
								<span className="font-medium text-neutral-200">
									Working directory
								</span>
								<input
									type="text"
									value={cwd}
									onChange={(e) => setCwd(e.target.value)}
									disabled={snapshot.status === "connecting"}
									placeholder="Optional ?cwd="
									className="rounded-md border border-neutral-800 bg-neutral-950 px-2 py-1.5 font-[inherit] text-xs text-neutral-100 outline-none placeholder:text-neutral-600 focus:border-cyan-400 disabled:opacity-60"
								/>
							</label>
							<button
								type="button"
								onClick={() => setConnectNonce((n) => n + 1)}
								disabled={snapshot.status === "connecting" || cwd.trim().length === 0}
								className="self-start rounded-md border border-neutral-700 bg-neutral-950 px-3 py-1 text-xs text-neutral-100 enabled:cursor-pointer enabled:hover:bg-neutral-900 disabled:opacity-50"
							>
								Reconnect
							</button>
							<button
								type="button"
								onClick={openProjectFolder}
								disabled={snapshot.status === "connecting"}
								className="self-start rounded-md border border-cyan-400/70 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-100 enabled:cursor-pointer enabled:hover:bg-cyan-400/20 disabled:opacity-50"
							>
								Open folder
							</button>
						</div>
						{latestSystem ? (
							<p
								className={`m-0 wrap-break-word text-[11px] leading-relaxed ${
									latestSystem.role === "stderr"
										? "text-red-300"
										: "text-neutral-400"
								}`}
							>
								{latestSystem.text}
							</p>
						) : null}
					</aside>
				)}
				<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-black">
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
						<div className="flex min-h-full flex-col gap-4">
							{snapshot.chatItems.map((item) => {
								if (item.type === "user") {
									return (
										<div key={item.id} className="flex w-full justify-end">
											<div className="max-w-[min(85%,42rem)] rounded-2xl rounded-br-md border border-cyan-400/60 bg-cyan-400/10 px-4 py-3 text-sm leading-relaxed text-cyan-50 shadow-lg shadow-black/20">
												{item.text}
											</div>
										</div>
									);
								}
								if (item.type === "assistant") {
									return (
										<div key={item.id} className="flex w-full justify-start">
											<div className="max-w-[min(85%,42rem)] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm leading-relaxed text-neutral-100 shadow-lg shadow-black/20">
												{item.text}
											</div>
										</div>
									);
								}
								if (item.type === "finding") {
									return (
										<div key={item.id} className="flex w-full justify-start">
											<ExplorationFinding
												finding={item.finding}
												file={snapshot.fileState}
												isResolved={snapshot.findingResolved}
											/>
										</div>
									);
								}
								return (
									<div key={item.id} className="flex w-full justify-start">
										<ChangeReviewQueue
											cards={item.batch.cards}
											decisions={item.batch.decisions}
											activeIndex={item.batch.activeIndex}
											onSelect={(index) => session.moveReviewCursor(index - item.batch.activeIndex)}
											diffStyle={reviewDiffStyle}
										/>
									</div>
								);
							})}

							{snapshot.pendingExplorationDecision && !snapshot.hasActiveTurn ? (
								<div className="mx-auto flex w-full max-w-5xl items-start gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2">
									<span
										className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<p className="m-0 text-xs font-medium text-cyan-100">
											Decision required: review this exploration finding before continuing.
										</p>
									</div>
								</div>
							) : null}
							{snapshot.pendingReviewDecision && !snapshot.hasActiveTurn ? (
								<div className="mx-auto flex w-full max-w-5xl items-start gap-2 rounded-lg border border-cyan-400/40 bg-cyan-400/10 px-3 py-2">
									<span
										className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-cyan-300"
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<p className="m-0 text-xs font-medium text-cyan-100">
											Decision required: review this change batch before continuing.
										</p>
									</div>
								</div>
							) : null}
							{snapshot.hasActiveTurn ? (
								<div
									className="mx-auto flex w-full max-w-[min(100%,42rem)] items-start gap-2 rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2"
									aria-live="polite"
								>
									<span
										className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-cyan-300"
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<p className="m-0 text-xs font-medium text-neutral-100">
											{snapshot.activeStep?.title ?? "Working…"}
										</p>
										{snapshot.activeStep?.detail ? (
											<p className="m-0 mt-0.5 break-all font-mono text-[10px] text-neutral-400">
												{snapshot.activeStep.detail}
											</p>
										) : null}
									</div>
								</div>
							) : null}
							<div ref={chatEndRef} className="h-px" />
						</div>
					</div>
					<div className="sticky bottom-0 z-10 shrink-0 bg-gradient-to-t from-black via-black/95 to-transparent px-4 pb-4 pt-2">
						<div className="mx-auto w-full max-w-3xl">
							<div className="mb-2 flex flex-wrap items-center gap-2">
								<AgentSelector
									value={selectedAgent}
									disabled={snapshot.status === "connecting" || snapshot.hasActiveTurn}
									onChange={setSelectedAgent}
								/>
								<ModelSelector
									value={selectedModel}
									disabled={snapshot.status === "connecting" || snapshot.hasActiveTurn}
									onChange={setSelectedModel}
								/>
							</div>
							{isReviewing ? (
								<ReviewPromptInput
									targetLabel={reviewTargetLabel(snapshot)}
									pendingCount={
										snapshot.pendingExplorationDecision
											? 1
											: snapshot.pendingReviewCount
									}
									active={snapshot.hasActiveTurn}
									disabled={snapshot.status !== "ready"}
									onSubmit={(kind, message) => session.sendReviewText(kind, message)}
								/>
							) : (
								<AgentPromptInput
									onSend={(message) => session.sendUserText(message)}
									onStop={() => session.stopTurn()}
									disabled={!snapshot.canSend}
									active={snapshot.hasActiveTurn}
									placeholder={promptPlaceholder(snapshot)}
								/>
							)}
						</div>
					</div>
				</section>
			</div>
		</main>
	);
};

const root = createRoot(document.getElementById("root") as HTMLElement);
root.render(<App />);

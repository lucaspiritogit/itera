import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronUp, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
	createAgentSessionOrchestrator,
	createDefaultAgentSessionPorts,
	type AgentSessionSnapshot,
} from "../features/agent-session/agent-session";
import { createSessionLifecycleController } from "../features/agent-session/provider-session";
import {
	createDefaultSessionShortcutPolicy,
	createSessionShortcutController,
	createSessionCommandPort,
	createSessionGateReader,
	createWindowKeyboardPort,
} from "../features/agent-session/review-workflow";
import {
	AgentPromptInput,
	ReviewPromptInput,
} from "../ui/components/AgentPromptInput";
import {
	ChangeReviewQueue,
	type ReviewDiffStyle,
} from "../ui/components/ChangeReviewQueue";
import { ExplorationFinding } from "../ui/components/ExplorationFinding";
import { ModelSelector } from "../ui/components/ModelSelector";
import { ThinkingLevelSelector } from "../ui/components/ThinkingLevelSelector";
import {
	buildModelThinkingLevelDefaults,
	DEFAULT_MODEL,
	MODEL_OPTIONS,
	type ModelId,
	type ModelThinkingLevel,
	THINKING_LEVEL_OPTIONS,
} from "../features/agent-session/agent-session/model-options";
import "../shared/styles/index.css";

const DEFAULT_CWD = "";
const CODEX_ICON_URL = new URL("../assets/Codex_light.svg", import.meta.url).href;

const AGENT_OPTIONS = [
	{
		id: "codex",
		label: "Codex",
		iconUrl: CODEX_ICON_URL,
	},
] as const;

type AgentId = (typeof AGENT_OPTIONS)[number]["id"];

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

function activeReviewCardId(snapshot: AgentSessionSnapshot): string | null {
	const batch = snapshot.reviewBatch;
	if (!batch || batch.cards.length === 0) {
		return null;
	}
	const active =
		batch.cards[Math.min(Math.max(batch.activeIndex, 0), batch.cards.length - 1)];
	return active?.id ?? null;
}

function AgentIcon({ iconUrl, label }: { iconUrl: string; label: string }) {
	return (
		<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded border border-stone-700/80 bg-stone-100">
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
				className="flex h-9 min-w-32 items-center gap-2 rounded-md border border-stone-700/80 bg-stone-950/90 px-2.5 text-xs text-stone-100 shadow-sm shadow-black/20 transition enabled:cursor-pointer enabled:hover:border-amber-400/70 enabled:hover:bg-stone-900 disabled:opacity-60"
			>
				<AgentIcon iconUrl={selected.iconUrl} label={selected.label} />
				<span className="truncate">{selected.label}</span>
				<ChevronUp className="ml-auto h-3.5 w-3.5 text-stone-500" aria-hidden />
			</button>
			{open ? (
				<div
					role="listbox"
					className="absolute bottom-full left-0 z-20 mb-1 w-full min-w-40 rounded-md border border-stone-700/80 bg-stone-950 p-1 shadow-xl shadow-black/45"
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
							className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-xs text-stone-100 enabled:cursor-pointer enabled:hover:bg-stone-900"
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

const App = () => {
	const [cwd, setCwd] = useState(DEFAULT_CWD);
	const [selectedAgent, setSelectedAgent] = useState<AgentId>("codex");
	const [selectedModel, setSelectedModel] = useState<ModelId>(DEFAULT_MODEL);
	const [modelThinkingLevels, setModelThinkingLevels] = useState(() =>
		buildModelThinkingLevelDefaults(),
	);
	const [connectNonce, setConnectNonce] = useState(0);
	const [folderPickerError, setFolderPickerError] = useState<string | null>(null);
	const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(true);
	const [reviewDiffStyle, setReviewDiffStyle] =
		useState<ReviewDiffStyle>("unified");
	const session = useMemo(
		() =>
			createAgentSessionOrchestrator({
				ports: createDefaultAgentSessionPorts(),
				initial: { cwd: DEFAULT_CWD, mode: "exploration" },
			}),
		[],
	);
	const [snapshot, setSnapshot] = useState(() => session.getSnapshot());
	const chatEndRef = useRef<HTMLDivElement | null>(null);
	const snapshotRef = useRef(snapshot);
	snapshotRef.current = snapshot;
	const keyboardController = useMemo(
		() =>
			createSessionShortcutController({
				policy: createDefaultSessionShortcutPolicy(),
			}),
		[],
	);
	const lifecycleController = useMemo(
		() =>
			createSessionLifecycleController({
				connect: (input) => session.connect(input),
				disconnect: () => session.disconnect(),
			}),
		[session],
	);
	const keyboardPort = useMemo(
		() =>
			createWindowKeyboardPort({
				isEditableTarget,
			}),
		[],
	);
	const commandPort = useMemo(
		() =>
			createSessionCommandPort({
				session,
				onToggleReviewDiffStyle: () =>
					setReviewDiffStyle((current) =>
						current === "unified" ? "split" : "unified",
					),
			}),
		[session],
	);
	const readGate = useMemo(
		() => createSessionGateReader(snapshotRef),
		[],
	);

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
		const openFolder = window.desktop?.openProjectFolder;
		if (!openFolder) {
			setFolderPickerError("Folder picker is unavailable in this runtime.");
			return;
		}
		setFolderPickerError(null);
		let selected: string | null;
		try {
			selected = await openFolder();
		} catch (error) {
			setFolderPickerError(
				error instanceof Error
					? error.message
					: "Folder picker failed to open.",
			);
			return;
		}
		if (!selected) {
			return;
		}
		setCwd(selected);
		setConnectNonce((n) => n + 1);
	}, []);

	useEffect(() => {
		return session.subscribe((_event, nextSnapshot) => {
			setSnapshot(nextSnapshot);
		});
	}, [session]);

	useEffect(() => {
		lifecycleController.update({
			cwd,
			model: selectedModel,
			modelSettings: { reasoningEffort: modelThinkingLevels[selectedModel] },
			reconnectToken: connectNonce,
		});
		return () => {
			lifecycleController.dispose();
		};
	}, [connectNonce, cwd, selectedModel, modelThinkingLevels, lifecycleController]);

	useEffect(() => {
		const stop = keyboardController.start({
			keyboard: keyboardPort,
			commandPort,
			readGate,
		});
		return () => {
			stop();
		};
	}, [commandPort, keyboardController, keyboardPort, readGate]);

	useEffect(() => {
		scrollToChatEnd();
	}, [snapshot.activeStep, snapshot.chatItems, snapshot.hasActiveTurn, scrollToChatEnd]);

	const latestSystem = snapshot.systemMessages[snapshot.systemMessages.length - 1];
	const isReviewing =
		snapshot.pendingExplorationDecision || snapshot.pendingReviewDecision;
	const selectedThinkingLevel = modelThinkingLevels[selectedModel];
	const reviewItemCount = snapshot.pendingExplorationDecision
		? 1
		: snapshot.reviewBatch?.cards.length ?? 1;
	const reviewCurrentIndex = snapshot.pendingExplorationDecision
		? 0
		: snapshot.reviewBatch?.activeIndex ?? 0;

	return (
		<main className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden rounded-xl border border-stone-700/70 bg-stone-950/70 shadow-[var(--shadow-panel)] backdrop-blur">
			<div className="flex min-h-0 flex-1 flex-row gap-0 overflow-hidden">
				{isSidebarCollapsed ? (
					<div className="flex shrink-0 border-r border-stone-800/90 bg-stone-950/80 p-2">
						<button
							type="button"
							onClick={() => setIsSidebarCollapsed(false)}
							aria-label="Open session sidebar"
							title="Open session sidebar"
							className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-700 bg-stone-900 text-amber-200 transition enabled:cursor-pointer enabled:hover:border-amber-400/70 enabled:hover:bg-stone-800"
						>
							<PanelLeftOpen className="h-4 w-4" aria-hidden />
						</button>
					</div>
				) : (
					<aside className="flex min-h-0 w-[min(100%,18rem)] shrink-0 flex-col gap-3 overflow-hidden border-r border-stone-800/90 bg-stone-950/80 p-3">
						<div className="flex items-center justify-end">
							<button
								type="button"
								onClick={() => setIsSidebarCollapsed(true)}
								aria-label="Close session sidebar"
								title="Close session sidebar"
								className="flex h-8 w-8 items-center justify-center rounded-md border border-stone-700 bg-stone-900 text-amber-200 transition enabled:cursor-pointer enabled:hover:border-amber-400/70 enabled:hover:bg-stone-800"
							>
								<PanelLeftClose className="h-4 w-4" aria-hidden />
							</button>
						</div>
						<p className="m-0 text-xs leading-relaxed text-stone-400">
							Status: {snapshot.status} · Mode: {snapshot.mode} · {import.meta.env.VITE_CODEX_BACKEND_WS}
						</p>
						<div className="flex flex-col gap-2 text-sm">
							<label className="flex flex-col gap-1">
								<span className="font-medium text-stone-200">
									Working directory
								</span>
								<input
									type="text"
									value={cwd}
									onChange={(e) => setCwd(e.target.value)}
									disabled={snapshot.status === "connecting"}
									placeholder="Optional ?cwd="
									className="rounded-md border border-stone-700/80 bg-stone-950 px-2 py-1.5 font-mono text-xs text-stone-100 shadow-inner shadow-black/20 outline-none placeholder:text-stone-600 focus:border-amber-400/70 disabled:opacity-60"
								/>
							</label>
							<button
								type="button"
								onClick={() => setConnectNonce((n) => n + 1)}
								disabled={snapshot.status === "connecting" || cwd.trim().length === 0}
								className="self-start rounded-md border border-stone-700 bg-stone-900 px-3 py-1 text-xs text-stone-100 transition enabled:cursor-pointer enabled:hover:bg-stone-800 disabled:opacity-50"
							>
								Reconnect
							</button>
							<button
								type="button"
								onClick={openProjectFolder}
								disabled={snapshot.status === "connecting"}
								className="self-start rounded-md border border-amber-400/55 bg-amber-400/10 px-3 py-1 text-xs font-semibold text-amber-100 transition enabled:cursor-pointer enabled:hover:bg-amber-400/15 disabled:opacity-50"
							>
								Open folder
							</button>
							{folderPickerError ? (
								<p className="m-0 text-xs text-red-300">{folderPickerError}</p>
							) : null}
						</div>
						{latestSystem ? (
							<p
								className={`m-0 wrap-break-word text-[11px] leading-relaxed ${latestSystem.role === "stderr"
									? "text-red-300"
									: "text-stone-400"
									}`}
							>
								{latestSystem.text}
							</p>
						) : null}
					</aside>
				)}
				<section className="flex min-h-0 min-w-0 flex-1 flex-col bg-[linear-gradient(180deg,rgba(24,22,18,0.76),rgba(9,9,8,0.94))]">
					<div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-4 py-4">
						<div className="flex min-h-full flex-col gap-4">
							{snapshot.chatItems.map((item) => {
								if (item.type === "user") {
									return (
										<div key={item.id} className="flex w-full justify-end">
											<div className="max-w-[min(85%,42rem)] rounded-2xl rounded-br-md border border-amber-400/35 bg-amber-400/10 px-4 py-3 text-sm leading-relaxed text-amber-50 shadow-lg shadow-black/25">
												{item.text}
											</div>
										</div>
									);
								}
								if (item.type === "assistant") {
									return (
										<div key={item.id} className="flex w-full justify-start">
											<div className="max-w-[min(85%,42rem)] whitespace-pre-wrap rounded-2xl rounded-bl-md border border-stone-700/70 bg-stone-950/95 px-4 py-3 text-sm leading-relaxed text-stone-100 shadow-lg shadow-black/25">
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

							{snapshot.pendingReviewDecision && !snapshot.hasActiveTurn ? (
								<div className="mx-auto flex w-full max-w-5xl items-start gap-3 rounded-lg border border-amber-400/60 bg-amber-400/10 px-3 py-2 shadow-lg shadow-amber-950/20">
									<span
										className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full bg-amber-300 shadow-[0_0_0_3px_rgba(251,191,36,0.14)]"
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<p className="m-0 text-xs font-semibold text-amber-100">
											Decision required: review this change batch before continuing.
										</p>
									</div>
								</div>
							) : null}
							{snapshot.hasActiveTurn ? (
								<div
									className="mx-auto flex w-full max-w-[min(100%,42rem)] items-start gap-2 rounded-lg border border-stone-700/80 bg-stone-950/90 px-3 py-2 shadow-lg shadow-black/20"
									aria-live="polite"
								>
									<span
										className="mt-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-amber-300"
										aria-hidden
									/>
									<div className="min-w-0 flex-1">
										<p className="m-0 text-xs font-medium text-stone-100">
											{snapshot.activeStep?.title ?? "Working…"}
										</p>
										{snapshot.activeStep?.detail ? (
											<p className="m-0 mt-0.5 break-all font-mono text-[10px] text-stone-400">
												{snapshot.activeStep.detail}
											</p>
										) : null}
									</div>
								</div>
							) : null}
							<div ref={chatEndRef} className="h-px" />
						</div>
					</div>
					<div className="sticky bottom-0 z-10 shrink-0 bg-linear-to-t from-stone-950 via-stone-950/95 to-transparent px-4 pb-4 pt-5">
						<div className="mx-auto flex w-full max-w-4xl flex-col gap-3">
							<div className="flex flex-wrap items-center justify-end gap-2">
								<AgentSelector
									value={selectedAgent}
									disabled={snapshot.status === "connecting" || snapshot.hasActiveTurn}
									onChange={setSelectedAgent}
								/>
								<ThinkingLevelSelector
									value={selectedThinkingLevel}
									options={THINKING_LEVEL_OPTIONS}
									disabled={snapshot.status === "connecting" || snapshot.hasActiveTurn}
									onChange={(thinkingLevel: ModelThinkingLevel) => {
										setModelThinkingLevels((current) => ({
											...current,
											[selectedModel]: thinkingLevel,
										}));
									}}
								/>
								<ModelSelector
									value={selectedModel}
									options={MODEL_OPTIONS}
									disabled={snapshot.status === "connecting" || snapshot.hasActiveTurn}
									onChange={setSelectedModel}
								/>
							</div>
							{isReviewing ? (
								<ReviewPromptInput
									targetLabel={reviewTargetLabel(snapshot)}
									itemCount={reviewItemCount}
									currentIndex={reviewCurrentIndex}
									pendingCount={
										snapshot.pendingExplorationDecision
											? 1
											: snapshot.pendingReviewCount
									}
									acceptLabel={
										snapshot.pendingExplorationDecision
											? "Accept finding"
											: "Accept change"
									}
									denyLabel={
										snapshot.pendingExplorationDecision
											? "Dismiss"
											: "Deny"
									}
									active={snapshot.hasActiveTurn}
									disabled={snapshot.status !== "ready"}
									onAccept={() => {
										if (snapshot.pendingExplorationDecision) {
											session.resolveFinding("approve");
											return;
										}
										const cardId = activeReviewCardId(snapshot);
										if (cardId) {
											session.setReviewDecision(cardId, "accepted");
										}
									}}
									onDeny={() => {
										if (snapshot.pendingExplorationDecision) {
											session.resolveFinding("dismiss");
											return;
										}
										const cardId = activeReviewCardId(snapshot);
										if (cardId) {
											session.setReviewDecision(cardId, "denied");
										}
									}}
									onNavigate={(direction) => {
										if (snapshot.pendingReviewDecision) {
											session.moveReviewCursor(direction === "prev" ? -1 : 1);
										}
									}}
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

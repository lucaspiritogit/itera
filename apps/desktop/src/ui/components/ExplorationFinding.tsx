import { useEffect, useMemo, useState } from "react";
import { codeToHtml } from "shiki";
import type { FileLoadState } from "../../features/agent-session/model/fileLoadState";
import type { ExplorationFinding as Finding } from "../../integrations/codex/codexWire";

export type ExplorationFindingProps = {
	finding: Finding;
	file?: FileLoadState;
	isResolved?: boolean;
};

export function ExplorationFinding({
	finding,
	file,
	isResolved = false,
}: ExplorationFindingProps) {
	const [isCollapsed, setIsCollapsed] = useState(false);
	const toggleLabel = isCollapsed
		? "Expand exploration finding"
		: "Collapse exploration finding";

	useEffect(() => {
		setIsCollapsed(isResolved);
	}, [finding.code, finding.file, isResolved]);

	return (
		<article className="flex w-full max-w-5xl flex-col gap-0 overflow-hidden rounded-xl border border-neutral-700/80 bg-neutral-900 shadow-2xl shadow-black/30">
			<header className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-800 bg-neutral-950 px-4 py-3">
				<div className="min-w-0 flex-1">
					<p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-sky-300">
						Exploration finding
					</p>
					<p
						className="m-0 mt-0.5 truncate font-mono text-sm text-neutral-100"
						title={finding.file}
					>
						{finding.file}
						{finding.startLine && finding.endLine
							? `:${finding.startLine}-${finding.endLine}`
							: ""}
					</p>
				</div>
				<div className="flex flex-wrap items-center gap-2">
					{isResolved ? (
						<p className="m-0 rounded-full border border-emerald-500/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] font-medium text-emerald-200">
							Reviewed
						</p>
					) : (
						<p className="m-0 rounded-full border border-amber-400/60 bg-amber-400/15 px-2.5 py-1 text-[11px] font-semibold text-amber-100">
							Decision required
						</p>
					)}
				</div>
			</header>

			{isCollapsed ? null : (
				<>
					<section className="border-b border-neutral-800 bg-neutral-950/70 px-4 py-3">
						<p className="m-0 text-[10px] font-semibold uppercase tracking-wider text-sky-200">
							What the agent found
						</p>
						<p className="m-0 mt-1 whitespace-pre-wrap text-sm leading-relaxed text-neutral-100">
							{finding.reason}
						</p>
					</section>

					<FileBody
						file={file}
						path={finding.file}
						code={finding.code}
						startLine={finding.startLine}
					/>
				</>
			)}
			<footer className="flex justify-center border-t border-neutral-900 bg-neutral-950/80 px-4 py-1.5">
				<button
					type="button"
					onClick={() => setIsCollapsed((current) => !current)}
					aria-expanded={!isCollapsed}
					aria-label={toggleLabel}
					title={toggleLabel}
					className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-800 bg-black text-neutral-200 enabled:cursor-pointer enabled:hover:border-sky-500/70 enabled:hover:text-sky-200"
				>
					<CollapseToggleIcon collapsed={isCollapsed} />
				</button>
			</footer>
		</article>
	);
}

function CollapseToggleIcon({ collapsed }: { collapsed: boolean }) {
	return (
		<svg
			aria-hidden="true"
			className="h-4 w-4"
			fill="none"
			stroke="currentColor"
			strokeLinecap="round"
			strokeLinejoin="round"
			strokeWidth="2"
			viewBox="0 0 24 24"
		>
			{collapsed ? <path d="m6 9 6 6 6-6" /> : <path d="m6 15 6-6 6 6" />}
		</svg>
	);
}

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
	cjs: "javascript",
	css: "css",
	cts: "typescript",
	go: "go",
	html: "html",
	js: "javascript",
	json: "json",
	jsonc: "jsonc",
	jsx: "jsx",
	md: "markdown",
	mdx: "mdx",
	mjs: "javascript",
	mts: "typescript",
	py: "python",
	rs: "rust",
	sh: "shellscript",
	ts: "typescript",
	tsx: "tsx",
	txt: "text",
	yaml: "yaml",
	yml: "yaml",
};

const LANGUAGE_BY_FILENAME: Record<string, string> = {
	dockerfile: "docker",
	makefile: "make",
};

function languageForPath(path: string): string {
	const filename = path.split("/").pop()?.toLowerCase() ?? "";
	const byFilename = LANGUAGE_BY_FILENAME[filename];
	if (byFilename) {
		return byFilename;
	}
	const extension = filename.includes(".") ? filename.split(".").pop() : "";
	return extension ? (LANGUAGE_BY_EXTENSION[extension] ?? "text") : "text";
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

function plainCodeHtml(code: string): string {
	return `<pre class="shiki fallback" style="background-color:#0a0a0a;color:#f5f5f5" tabindex="0"><code>${escapeHtml(
		code,
	)}</code></pre>`;
}

function FileBody({
	file,
	path,
	code,
	startLine,
}: {
	file?: FileLoadState;
	path: string;
	code: string;
	startLine?: number;
}) {
	const language = useMemo(() => languageForPath(path), [path]);
	const [highlightedHtml, setHighlightedHtml] = useState<string | null>(null);
	const visibleCode = file?.status === "ready" ? file.content : code;

	useEffect(() => {
		let cancelled = false;
		setHighlightedHtml(null);
		codeToHtml(visibleCode, {
			lang: language,
			theme: "github-dark",
		})
			.then((html) => {
				if (!cancelled) {
					setHighlightedHtml(html);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setHighlightedHtml(plainCodeHtml(visibleCode));
				}
			});
		return () => {
			cancelled = true;
		};
	}, [visibleCode, language]);

	return (
		<section className="flex flex-col bg-neutral-950">
			<div className="border-b border-neutral-900 px-4 py-2">
				<p className="m-0 font-mono text-[11px] text-neutral-400">
					{startLine ? `Excerpt starts at line ${startLine}` : "Code excerpt"}
				</p>
			</div>
			<div
				className="max-h-[60vh] overflow-auto text-[12px] leading-relaxed [&_pre]:m-0 [&_pre]:min-h-full [&_pre]:px-4 [&_pre]:py-3 [&_pre]:font-mono [&_pre]:outline-none"
				dangerouslySetInnerHTML={{
					__html: highlightedHtml ?? plainCodeHtml(visibleCode),
				}}
			/>
		</section>
	);
}

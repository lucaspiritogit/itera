import path from "node:path";

export function resolveInsideCwd(cwd: string, requested: string): string | null {
	const cwdAbs = path.resolve(cwd);
	const target = path.resolve(cwdAbs, requested);
	const rel = path.relative(cwdAbs, target);
	if (rel.startsWith("..") || path.isAbsolute(rel)) {
		return null;
	}
	return target;
}


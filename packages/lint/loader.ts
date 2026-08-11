import { dirname, resolve } from "node:path";
import type { Fs } from "@webappwiz/sys";
import { DEFAULT_GUIDE, type Guide, isGuide, type RuleRef } from "./guide";
import { checkGuide, compile, type GuideDiagnostic, type Rule } from "./rule";
import { recommended } from "./rules";

/** Turns a guide module path into the guide and the directory it lives in,
 * the home that relative rule paths resolve against. */
export interface GuideLoader {
	load(path: string): Promise<{ guide: Guide; dir: string }>;
}

/** Imports the module for real: Bun runs the user's TypeScript directly. */
export class ModuleGuideLoader implements GuideLoader {
	async load(path: string): Promise<{ guide: Guide; dir: string }> {
		const abs = resolve(path);
		const module = await import(abs);
		// a module loaded at runtime is beyond the type system, so re-check here
		if (!isGuide(module.default)) {
			throw new Error(`${path} must default-export defineGuide([...])`);
		}
		return { guide: module.default, dir: dirname(abs) };
	}
}

/**
 * Every rule a guide names, compiled, with everything wrong with the guide
 * alongside them. A rule that will not compile is a diagnostic and no rule,
 * so a caller can still work with the rest.
 */
export async function loadGuide(
	fs: Fs,
	path: string,
	loader: GuideLoader = new ModuleGuideLoader(),
): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
	const { guide, dir } = await loader.load(path);
	return compileGuide(fs, guide.rules, dir);
}

/**
 * The project's guide: `lint.config.ts` when the project has one, and the
 * recommended rules when it does not, the way any linter defaults.
 */
export async function loadProjectGuide(
	fs: Fs,
	path = DEFAULT_GUIDE,
	loader?: GuideLoader,
): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
	if (path === DEFAULT_GUIDE && !(await fs.exists(resolve(path)))) {
		// recommended refs carry absolute paths, so any dir resolves them
		return compileGuide(fs, recommended, ".");
	}
	return loadGuide(fs, path, loader);
}

async function compileGuide(
	fs: Fs,
	refs: RuleRef[],
	dir: string,
): Promise<{ rules: Rule[]; diagnostics: GuideDiagnostic[] }> {
	const rules: Rule[] = [];
	const diagnostics: GuideDiagnostic[] = [];
	for (const ref of refs) {
		let text: string;
		try {
			text = await fs.read(resolve(dir, ref.path));
		} catch {
			diagnostics.push({
				path: ref.path,
				severity: "error",
				message: "cannot read rule file",
			});
			continue;
		}
		// diagnostics name the path as the guide wrote it, which stays short
		const out = compile(text, ref.path, ref);
		diagnostics.push(...out.diagnostics);
		if (out.rule) {
			rules.push(out.rule);
		}
	}
	diagnostics.push(...checkGuide(rules));
	return { rules, diagnostics };
}

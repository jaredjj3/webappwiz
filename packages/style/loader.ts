import { dirname, resolve } from "node:path";
import type { Fs } from "@webappwiz/sys";
import { isStyleGuide, type StyleGuide } from "./guide";
import { checkGuide, compile, type Diagnostic, type Rule } from "./rule";

/** Turns a guide module path into the guide and the directory it lives in —
 * the home that relative rule paths resolve against. */
export interface GuideLoader {
	load(path: string): Promise<{ guide: StyleGuide; dir: string }>;
}

/** Imports the module for real — Bun runs the user's TypeScript directly. */
export class ModuleGuideLoader implements GuideLoader {
	async load(path: string): Promise<{ guide: StyleGuide; dir: string }> {
		const abs = resolve(path);
		const module = await import(abs);
		// a module loaded at runtime is beyond the type system, so re-check here
		if (!isStyleGuide(module.default)) {
			throw new Error(`${path} must default-export defineStyleGuide([...])`);
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
): Promise<{ rules: Rule[]; diagnostics: Diagnostic[] }> {
	const { guide, dir } = await loader.load(path);
	const rules: Rule[] = [];
	const diagnostics: Diagnostic[] = [];
	for (const ref of guide.rules) {
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
		const out = compile(text, ref.path);
		diagnostics.push(...out.diagnostics);
		if (out.rule) {
			rules.push(out.rule);
		}
	}
	diagnostics.push(...checkGuide(rules));
	return { rules, diagnostics };
}

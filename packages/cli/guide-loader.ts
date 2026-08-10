import { dirname, resolve } from "node:path";
import { isStyleGuide, type StyleGuide } from "@webappwiz/style";

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

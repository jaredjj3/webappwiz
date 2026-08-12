import { resolve } from "node:path";
import { type Guide, isGuide } from "../guide";
import type { GuideLoader } from "./guide-loader";

/** Imports the module for real: Bun runs the user's TypeScript directly. */
export class ModuleGuideLoader implements GuideLoader {
	async load(path: string): Promise<Guide> {
		const module = await import(resolve(path));
		// a module loaded at runtime is beyond the type system, so re-check here
		if (!isGuide(module.default)) {
			throw new Error(`${path} must default-export defineGuide([...])`);
		}
		return module.default;
	}
}

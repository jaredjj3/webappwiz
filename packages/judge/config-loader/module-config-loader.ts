import { resolve } from "node:path";
import { type Config, isConfig } from "../config";
import type { ConfigLoader } from "./config-loader";

/** Imports the module for real: Bun runs the user's TypeScript directly. */
export class ModuleConfigLoader implements ConfigLoader {
	async load(path: string): Promise<Config> {
		const full = resolve(path);
		// Said here rather than left to the import: a project with no config runs
		// no rules at all, and "cannot find module" reads like a broken install
		// rather than the one file it is asking for.
		if (!(await Bun.file(full).exists())) {
			throw new Error(
				`no ${path}: name the rules to run in one, ` +
					"`export default defineConfig({ rules: [...] })`",
			);
		}
		const module = await import(full);
		// a module loaded at runtime is beyond the type system, so re-check here
		if (!isConfig(module.default)) {
			throw new Error(`${path} must default-export defineConfig({ ... })`);
		}
		return module.default;
	}
}

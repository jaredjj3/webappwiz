import { access } from "node:fs/promises";
import { resolve } from "node:path";
import type { ConfigLoader } from "./config-loader";

const exists = (path: string): Promise<boolean> =>
	access(path).then(
		() => true,
		() => false,
	);

/**
 * Imports the module for real, so whatever runs this has to read the user's
 * TypeScript itself. That is the whole reason `ConfigLoader` exists, and this
 * class is where the requirement is allowed to live.
 */
export class ModuleConfigLoader implements ConfigLoader {
	async load(path: string, key: string): Promise<unknown> {
		const full = resolve(path);
		// Said here rather than left to the import: a project with no config runs
		// no rules at all, and "cannot find module" reads like a broken install
		// rather than the one file it is asking for.
		if (!(await exists(full))) {
			throw new Error(
				`no ${path}: name the rules to run in one, ` +
					`\`export default { ${key}: ... }\``,
			);
		}
		const module = await import(full);
		const sections: unknown = module.default;
		if (typeof sections !== "object" || sections === null) {
			throw new Error(`${path} must default-export an object of sections`);
		}
		return (sections as Record<string, unknown>)[key];
	}
}

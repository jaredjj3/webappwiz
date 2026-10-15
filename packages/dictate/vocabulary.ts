import type { System } from "@webappwiz/arbor/systems";

/** Names the repo goes by that no system in `arbor.systems.ts` is called. */
export const PROJECT_WORDS = ["webappwiz", "wiz", "arbor", "scry"];

/**
 * The prompt that gets the repo's own words spelled its way: every system's
 * name and aliases, after the words the project itself goes by.
 */
export function vocabulary(systems: Record<string, System>): string {
	const words = new Set(PROJECT_WORDS);
	for (const [name, system] of Object.entries(systems)) {
		words.add(name);
		for (const alias of system.aliases ?? []) {
			words.add(alias);
		}
	}
	return `A developer dictating a prompt for a coding agent. Words that may come up: ${[...words].join(", ")}.`;
}

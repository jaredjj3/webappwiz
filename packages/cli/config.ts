/** The agent commands a check sends its prompts to, by effort. */
export interface Agents {
	low?: string;
	medium?: string;
	high?: string;
}

/** How `wiz scry` runs. */
export interface ScryConfig {
	/**
	 * A shell command for each effort, run with `sh -c` in the project root.
	 * It gets a whole prompt on stdin and answers on stdout, so any agent CLI
	 * or model runner fits. Only `medium` is required: an effort with no
	 * command of its own uses `medium`'s.
	 */
	agents?: Agents;
	/**
	 * The estimated input tokens a check spends without asking first; more
	 * than this and it asks `Proceed? [y/N]`. 100,000 when not set.
	 */
	budget?: number;
	/**
	 * The estimated input tokens one agent call holds. Files that match the
	 * same rules share a call, so the rules are sent once for all of them,
	 * until the next file would take it past this. 32,000 when not set.
	 */
	batch?: number;
	/** How many agent calls run at once. 4 when not set. */
	jobs?: number;
}

/** What `.wiz/config.ts` and the user's own config file hold. */
export interface Config {
	scry?: ScryConfig;
}

/**
 * Identity, for the types. `export default defineConfig({ ... })` in
 * `.wiz/config.ts` gets its keys checked and completed. A config somewhere
 * `@webappwiz/cli` is not installed, like the one in your home directory,
 * exports the same object without it.
 */
export function defineConfig(config: Config): Config {
	return config;
}

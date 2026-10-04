/**
 * A decision model, by the name its provider gives it: `clef` or
 * `clef-flash` on Cloudflare Workers AI, which read `CLOUDFLARE_ACCOUNT_ID`
 * and `CLOUDFLARE_API_TOKEN`, or a Jev on TypeSafe, like `jev-latest`, which
 * reads `TYPESAFE_API_KEY`.
 */
export type Model = "clef" | "clef-flash" | `jev-${string}`;

/** How `wiz scry` runs. */
export interface ScryConfig {
	/** The model a rule's decider asks. `clef` when not set. */
	model?: Model;
	/** How many requests to the model are out at once. 8 when not set. */
	jobs?: number;
}

/** Which credentials a project keeps, and where. */
export interface CredentialsConfig {
	/**
	 * What the operating system's store keeps them under, as
	 * `webappwiz:<project>`. The repository's directory name when not set,
	 * which every git worktree of it shares.
	 */
	project?: string;
	/**
	 * Every credential the project's own code uses, by environment variable
	 * name, with what it is for, so `creds list` shows it and
	 * `creds add` takes it. The ones wiz uses itself are always there.
	 */
	names?: Record<string, string>;
}

/** What `.wiz/config.ts` and the user's own config file hold. */
export interface Config {
	scry?: ScryConfig;
	credentials?: CredentialsConfig;
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

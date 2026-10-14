/** Which credentials a project keeps, and where. */
export interface CredentialsConfig {
	/**
	 * What the operating system's store keeps the project's under, as
	 * `webappwiz:<project>`. The repository's directory name when not set,
	 * which every git worktree of it shares. The user's config wins over the
	 * project's.
	 */
	project?: string;
	/**
	 * The credentials the project's own code needs, by environment variable
	 * name, with what each is for, so `creds list` shows one even before
	 * anyone keeps it. Optional: `creds add` takes any name, and what the
	 * stores keep is listed anyway. The ones wiz uses itself are always there.
	 */
	names?: Record<string, string>;
}

/**
 * What `.wiz/config.ts` and the user's own `~/.config/wiz/config.ts` hold.
 * scry's settings have a file of their own, `scry.config.ts`.
 */
export interface Config {
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

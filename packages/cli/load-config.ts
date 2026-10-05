import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type { Config, Model, ScryConfig } from "./config";

/** `scry` with every default filled in. */
export interface Settings {
	model: Model;
	jobs: number;
	exclude: string[];
}

/** What `loadConfig` reads through; the real ones by default. */
export interface LoadConfigOptions {
	fs?: Fs;
	/** Where the environment and the home directory come from. */
	ps?: Ps;
}

/**
 * The settings `wiz scry` runs with, each layer over the last: the
 * defaults, the project's `.wiz/config.ts`, the user's
 * `$XDG_CONFIG_HOME/wiz/config.ts` (`~/.config/wiz/config.ts`), then
 * `WIZ_SCRY_MODEL` and `WIZ_SCRY_JOBS`. `exclude` gathers every layer's.
 */
export async function loadConfig(
	dir: string,
	opts: LoadConfigOptions = {},
): Promise<Settings> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const layers = [
		...(await files(dir, fs, ps)).map((config) => scry(config)),
		environment(ps),
	];
	const settings: Settings = { model: "clef", jobs: 8, exclude: [] };
	for (const layer of layers) {
		settings.model = layer.model ?? settings.model;
		settings.jobs = layer.jobs ?? settings.jobs;
		settings.exclude = [...settings.exclude, ...(layer.exclude ?? [])];
	}
	return settings;
}

/**
 * The credentials `wiz creds` and scry know of: the project's
 * `.wiz/config.ts`'s names and the user's own, merged. Where they are kept
 * is `SystemSecretStore.forProject`'s to say.
 */
export async function loadCredentialsConfig(
	dir: string,
	opts: LoadConfigOptions = {},
): Promise<{ names: Record<string, string> }> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	let names: Record<string, string> = {};
	for (const { config } of await files(dir, fs, ps)) {
		names = { ...names, ...config.credentials?.names };
	}
	return { names };
}

/** The project's config, then the user's, each with where it came from. */
async function files(
	dir: string,
	fs: Fs,
	ps: Ps,
): Promise<{ path: string; config: Config }[]> {
	const home = ps.env("XDG_CONFIG_HOME") ?? `${ps.env("HOME") ?? "~"}/.config`;
	const found: { path: string; config: Config }[] = [];
	for (const path of [`${dir}/.wiz/config.ts`, `${home}/wiz/config.ts`]) {
		if (await fs.exists(path)) {
			// failing beats falling back: a config silently ignored is a run
			// against settings nobody chose
			const mod = (await import(path).catch((cause: unknown) => {
				throw new Error(`could not load ${path}: ${cause}`, { cause });
			})) as { default?: Config };
			found.push({ path, config: mod.default ?? {} });
		}
	}
	return found;
}

function scry({ path, config }: { path: string; config: Config }): ScryConfig {
	const scry = (config.scry ?? {}) as ScryConfig & Record<string, unknown>;
	// a setting that does nothing now is a check run unlike its author meant
	const gone = ["agents", "budget", "batch", "models"].filter(
		(key) => key in scry,
	);
	if (gone.length > 0) {
		throw new Error(
			`${path}: scry.${gone.join(", scry.")} ${gone.length === 1 ? "is" : "are"} gone: a rule's check asks one decision model now, chosen by scry.model`,
		);
	}
	return scry;
}

function environment(ps: Ps): ScryConfig {
	// checked where the model is used, which knows every provider
	const model = (ps.env("WIZ_SCRY_MODEL") || undefined) as Model | undefined;
	return { model, jobs: number(ps, "WIZ_SCRY_JOBS") };
}

function number(ps: Ps, name: string): number | undefined {
	const raw = ps.env(name);
	if (raw === undefined || raw === "") {
		return undefined;
	}
	const value = Number(raw);
	if (!Number.isFinite(value) || value < 0) {
		throw new Error(`${name}: expected a number, got "${raw}"`);
	}
	return value;
}

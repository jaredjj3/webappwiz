import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type {
	Config,
	CredentialsConfig,
	Model,
	Models,
	ScryConfig,
} from "./config";

/** `scry` with every default filled in. */
export interface Settings {
	models: Required<Models>;
	jobs: number;
}

/** What `loadConfig` reads through; the real ones by default. */
export interface LoadConfigOptions {
	fs?: Fs;
	/** Where the environment and the home directory come from. */
	ps?: Ps;
}

const EFFORTS = ["low", "medium", "high"] as const;

/**
 * The settings `wiz scry` runs with, each layer over the last: the
 * defaults, the project's `.wiz/config.ts`, the user's
 * `$XDG_CONFIG_HOME/wiz/config.ts` (`~/.config/wiz/config.ts`), then
 * `WIZ_SCRY_MODEL_LOW`, `_MEDIUM`, `_HIGH` and `WIZ_SCRY_JOBS`. The models
 * merge one effort at a time, so a user can swap the project's `high` and
 * keep its `low`.
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
	const settings: Settings = {
		models: { low: "clef", medium: "clef", high: "clef" },
		jobs: 8,
	};
	for (const layer of layers) {
		settings.models = { ...settings.models, ...layer.models };
		settings.jobs = layer.jobs ?? settings.jobs;
	}
	return settings;
}

/**
 * The credentials settings `wiz creds` and scry run with: the
 * project's `.wiz/config.ts`, then the user's own over it, their names
 * merged.
 */
export async function loadCredentialsConfig(
	dir: string,
	opts: LoadConfigOptions = {},
): Promise<CredentialsConfig & { names: Record<string, string> }> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const settings: CredentialsConfig & { names: Record<string, string> } = {
		names: {},
	};
	for (const { config } of await files(dir, fs, ps)) {
		const layer = config.credentials ?? {};
		settings.project = layer.project ?? settings.project;
		settings.names = { ...settings.names, ...layer.names };
	}
	return settings;
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
	const gone = ["agents", "budget", "batch"].filter((key) => key in scry);
	if (gone.length > 0) {
		throw new Error(
			`${path}: scry.${gone.join(", scry.")} ${gone.length === 1 ? "is" : "are"} gone: scry asks decision models now, chosen by scry.models`,
		);
	}
	return scry;
}

function environment(ps: Ps): ScryConfig {
	const models: Models = {};
	for (const effort of EFFORTS) {
		const model = ps.env(`WIZ_SCRY_MODEL_${effort.toUpperCase()}`);
		if (model) {
			// checked where the model is used, which knows every provider
			models[effort] = model as Model;
		}
	}
	return { models, jobs: number(ps, "WIZ_SCRY_JOBS") };
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

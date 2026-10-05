import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import {
	type Config,
	EFFORTS,
	type Effort,
	type Models,
	type ScryConfig,
} from "./config";

/** `scry` with every default filled in. */
export interface Settings {
	effort: Effort;
	/** The models each effort asks, every one named. */
	models: Record<Effort, Models>;
	jobs: number;
	exclude: string[];
}

/** The models each effort asks when no config names them. */
export const DEFAULT_MODELS: Record<Effort, Models> = {
	low: { decider: "clef-flash", llm: "claude-haiku-4-5" },
	medium: { decider: "clef", llm: "claude-sonnet-5-5" },
	high: { decider: "clef", llm: "claude-opus-5-5" },
};

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
 * `WIZ_SCRY_EFFORT` and `WIZ_SCRY_JOBS`. `models` lays each model of each
 * effort over the last layer's, and `exclude` gathers every layer's.
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
		effort: "medium",
		models: structuredClone(DEFAULT_MODELS),
		jobs: 8,
		exclude: [],
	};
	for (const layer of layers) {
		settings.effort = layer.effort ?? settings.effort;
		for (const effort of EFFORTS) {
			settings.models[effort] = {
				...settings.models[effort],
				...layer.models?.[effort],
			};
		}
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
	const gone = ["agents", "budget", "batch", "model"].filter(
		(key) => key in scry,
	);
	if (gone.length > 0) {
		throw new Error(
			`${path}: scry.${gone.join(", scry.")} ${gone.length === 1 ? "is" : "are"} gone: scry.models names the models each effort asks, and scry.effort which effort a check runs at`,
		);
	}
	if (scry.effort !== undefined) {
		effort(`${path}: scry.effort`, scry.effort);
	}
	// a model name is checked where it is used, which knows every provider
	for (const [key, models] of Object.entries(scry.models ?? {})) {
		if (!(EFFORTS as readonly string[]).includes(key)) {
			throw new Error(
				`${path}: scry.models.${key}: expected an effort, one of ${EFFORTS.join(", ")}`,
			);
		}
		if (typeof models !== "object" || models === null) {
			throw new Error(
				`${path}: scry.models.${key}: expected the models it asks, like { decider: "clef", llm: "claude-sonnet-5-5" }`,
			);
		}
	}
	return scry;
}

function environment(ps: Ps): ScryConfig {
	if (ps.env("WIZ_SCRY_MODEL")) {
		throw new Error(
			"WIZ_SCRY_MODEL is gone: set WIZ_SCRY_EFFORT to low, medium or high, and scry.models for the models each asks",
		);
	}
	const raw = ps.env("WIZ_SCRY_EFFORT") || undefined;
	return {
		effort: raw === undefined ? undefined : effort("WIZ_SCRY_EFFORT", raw),
		jobs: number(ps, "WIZ_SCRY_JOBS"),
	};
}

/** `value` as an effort, or an error saying where it came from. */
function effort(where: string, value: string): Effort {
	if (!(EFFORTS as readonly string[]).includes(value)) {
		throw new Error(
			`${where}: expected one of ${EFFORTS.join(", ")}, got "${value}"`,
		);
	}
	return value as Effort;
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

/** What a command line can say over the config about which models a check asks. */
export interface ModelChoice {
	/** Over `scry.effort`. */
	effort?: Effort;
	/** The decider's model, over the effort's. */
	model?: string;
	/** The llm's model, over the effort's. */
	llm?: string;
}

/** The models a check asks: the effort's, less what the command line names. */
export function chooseModels(settings: Settings, choice: ModelChoice): Models {
	const models = settings.models[choice.effort ?? settings.effort];
	// a model name is checked where it is used, which knows every provider
	return {
		decider: (choice.model ?? models.decider) as Models["decider"],
		llm: (choice.llm ?? models.llm) as Models["llm"],
	};
}

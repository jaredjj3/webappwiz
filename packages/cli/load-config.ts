import { EFFORTS } from "@webappwiz/scry";
import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import {
	type Budget,
	type ByEffort,
	type Config,
	type Models,
	type ModelsConfig,
	ROLES,
	type Role,
	type ScryConfig,
} from "./config";
import { within } from "./scry/budgets";

/** `scry` with every default filled in. */
export interface Settings {
	/** The models a check asks, every role named. */
	models: Models;
	/** Other models to check with, by name, each only what it lays over `models`. */
	profiles: Record<string, ModelsConfig>;
	jobs: number;
	exclude: string[];
	/** What a check may spend, the presets spelled out; none when nothing declares it. */
	budgets?: Budget[];
}

/** The models a check asks when no config names them. */
export const DEFAULT_MODELS: Models = {
	som: { default: "clef", low: "clef-flash" },
	llm: {
		default: "claude-sonnet-5-5",
		low: "claude-haiku-4-5",
		high: "claude-opus-5-5",
	},
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
 * `WIZ_SCRY_JOBS`. `models` and each of `profiles` lay each model they name
 * over the last layer's, effort by effort, `exclude` gathers every layer's, and
 * `budgets` is the last layer's to set it, whole.
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
		models: { ...DEFAULT_MODELS },
		profiles: {},
		jobs: 8,
		exclude: [],
	};
	for (const layer of layers) {
		settings.models = lay(settings.models, layer.models);
		for (const [name, models] of Object.entries(layer.profiles ?? {})) {
			settings.profiles[name] = lay(settings.profiles[name] ?? {}, models);
		}
		settings.jobs = layer.jobs ?? settings.jobs;
		settings.exclude = [...settings.exclude, ...(layer.exclude ?? [])];
		settings.budgets = budgets(layer.budgets) ?? settings.budgets;
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
	if ("budget" in scry) {
		throw new Error(
			`${path}: scry.budget is gone: scry.budgets declares what a check may spend`,
		);
	}
	const gone = ["agents", "batch", "model", "effort"].filter(
		(key) => key in scry,
	);
	if (gone.length > 0) {
		throw new Error(
			`${path}: scry.${gone.join(", scry.")} ${gone.length === 1 ? "is" : "are"} gone: scry.models names the models a check asks, at each effort a rule's questions ask, and scry.profiles others that --profile picks for one run`,
		);
	}
	if (scry.budgets !== undefined) {
		checkBudgets(`${path}: scry.budgets`, scry.budgets);
	}
	checkModels(`${path}: scry.models`, scry.models ?? {});
	const profiles: unknown = scry.profiles ?? {};
	if (!isRecord(profiles)) {
		throw new Error(
			`${path}: scry.profiles: expected models by name, like { "double-check": { som: "jev-latest" } }`,
		);
	}
	for (const [name, models] of Object.entries(profiles)) {
		checkModels(`${path}: scry.profiles.${name}`, models);
	}
	return scry;
}

/**
 * Throws, saying where, unless `value` names models by role, each one name
 * or one per effort. A model's name is checked where it is used, which knows
 * every provider.
 */
function checkModels(where: string, value: unknown): void {
	if (!isRecord(value)) {
		throw new Error(
			`${where}: expected the models a check asks, like { som: "clef", llm: "claude-sonnet-5-5" }`,
		);
	}
	for (const [role, models] of Object.entries(value)) {
		renamed(`${where}.${role}`, role);
		if (!(ROLES as readonly string[]).includes(role)) {
			// models were once named per run-wide effort, as { high: { llm: ... } }
			throw new Error(
				`${where}.${role}: expected ${ROLES.join(" or ")}, each a model or one per effort`,
			);
		}
		if (typeof models === "string") {
			continue;
		}
		if (!isRecord(models)) {
			throw new Error(
				`${where}.${role}: expected a model, or one per effort, like { default: "clef", low: "clef-flash" }`,
			);
		}
		for (const [effort, model] of Object.entries(models)) {
			if (
				!["default", ...EFFORTS].includes(effort) ||
				typeof model !== "string"
			) {
				throw new Error(
					`${where}.${role}.${effort}: expected a model at default, ${EFFORTS.join(", ")}`,
				);
			}
		}
	}
}

/**
 * `over`'s models laid on `under`'s, effort by effort: a bare name is the
 * model at every effort, and an effort `over` leaves out keeps `under`'s.
 */
function lay<M extends ModelsConfig>(under: M, over: ModelsConfig = {}): M {
	const laid: ModelsConfig = { ...under };
	for (const role of ROLES) {
		if (over[role] !== undefined) {
			laid[role] = { ...efforts(under[role]), ...efforts(over[role]) } as never;
		}
	}
	return laid as M;
}

function efforts(models: ModelsConfig[Role]): Partial<ByEffort<string>> {
	return typeof models === "string"
		? Object.fromEntries(["default", ...EFFORTS].map((each) => [each, models]))
		: (models ?? {});
}

/** Throws, saying where, when `key` is the role `som` was once called. */
function renamed(where: string, key: string): void {
	if (key === "decider") {
		throw new Error(
			`${where}: decider is now som, the System One model a rule asks first`,
		);
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The presets as the lists they stand for. */
function budgets(value: ScryConfig["budgets"]): Budget[] | undefined {
	return value === "nothing" || value === "unlimited"
		? [{ som: value, llm: value }]
		: value;
}

/** Throws, saying where, unless `value` is budgets a check can hold to. */
function checkBudgets(where: string, value: unknown): void {
	const example = `"nothing", "unlimited", or limits like [{ llm: 2_000_000, per: "month" }]`;
	if (value === "nothing" || value === "unlimited") {
		return;
	}
	if (!Array.isArray(value)) {
		throw new Error(`${where}: expected ${example}`);
	}
	for (const [index, budget] of value.entries()) {
		const at = `${where}[${index}]`;
		if (typeof budget !== "object" || budget === null) {
			throw new Error(
				`${at}: expected a limit like { llm: 2_000_000, per: "month" }`,
			);
		}
		const entry = budget as Record<string, unknown>;
		for (const key of Object.keys(entry)) {
			renamed(`${at}.${key}`, key);
		}
		const unknown = Object.keys(entry).filter(
			(key) => ![...ROLES, "per", "within"].includes(key),
		);
		if (unknown.length > 0) {
			throw new Error(
				`${at}: unknown ${unknown.join(", ")}: expected som, llm, per or within`,
			);
		}
		if (ROLES.every((role) => entry[role] === undefined)) {
			throw new Error(`${at}: expected som, llm, or both`);
		}
		for (const role of ROLES) {
			const spend = entry[role];
			if (
				spend !== undefined &&
				spend !== "nothing" &&
				spend !== "unlimited" &&
				!(typeof spend === "number" && Number.isFinite(spend) && spend >= 0)
			) {
				throw new Error(
					`${at}.${role}: expected input tokens, "nothing" or "unlimited", got ${JSON.stringify(spend)}`,
				);
			}
		}
		if (entry.per !== undefined && entry.within !== undefined) {
			throw new Error(`${at}: expected per or within, not both`);
		}
		const periods = ["check", "day", "week", "month"];
		if (entry.per !== undefined && !periods.includes(entry.per as string)) {
			throw new Error(
				`${at}.per: expected one of ${periods.join(", ")}, got ${JSON.stringify(entry.per)}`,
			);
		}
		if (entry.within !== undefined) {
			try {
				within(String(entry.within));
			} catch (error) {
				throw new Error(`${at}.within: ${(error as Error).message}`);
			}
		}
		if (
			ROLES.some((role) => typeof entry[role] === "number") &&
			entry.per === undefined &&
			entry.within === undefined
		) {
			throw new Error(
				`${at}: a number of tokens needs a window: per "check", "day", "week" or "month", or within, like "7d"`,
			);
		}
	}
}

function environment(ps: Ps): ScryConfig {
	if (ps.env("WIZ_SCRY_MODEL")) {
		throw new Error(
			"WIZ_SCRY_MODEL is gone: scry.models names the models a check asks, at each effort a rule's questions ask, and scry.profiles others that --profile picks for one run",
		);
	}
	if (ps.env("WIZ_SCRY_EFFORT")) {
		throw new Error(
			"WIZ_SCRY_EFFORT is gone: scry.models names the models a check asks, at each effort a rule's questions ask, and scry.profiles others that --profile picks for one run",
		);
	}
	return { jobs: number(ps, "WIZ_SCRY_JOBS") };
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
	/** One of `scry.profiles`, laid over `scry.models`. */
	profile?: string;
}

/** The models a check asks: the config's, with the profile's laid over them. */
export function chooseModels(settings: Settings, choice: ModelChoice): Models {
	if (choice.profile === undefined) {
		return settings.models;
	}
	const profile = settings.profiles[choice.profile];
	if (profile === undefined) {
		const known = Object.keys(settings.profiles);
		throw new Error(
			`no profile "${choice.profile}": ${known.length === 0 ? "scry.profiles names none" : `scry.profiles names ${known.join(", ")}`}`,
		);
	}
	return lay(settings.models, profile);
}

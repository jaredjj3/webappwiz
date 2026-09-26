import { type Fs, NodeFs, NodePs, type Ps } from "webappwiz/system";
import type { Agents, Config, ScryConfig } from "./config";

/** `scry` with every default filled in. */
export interface Settings {
	agents: Agents;
	budget: number;
	batch: number;
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
 * `WIZ_SCRY_AGENT_LOW`, `_MEDIUM`, `_HIGH`, `WIZ_SCRY_BUDGET`,
 * `WIZ_SCRY_BATCH` and `WIZ_SCRY_JOBS`. The agents merge one effort at a time, so a user can
 * swap the project's `medium` and keep its `low`.
 */
export async function loadConfig(
	dir: string,
	opts: LoadConfigOptions = {},
): Promise<Settings> {
	const fs = opts.fs ?? new NodeFs();
	const ps = opts.ps ?? new NodePs();
	const home = ps.env("XDG_CONFIG_HOME") ?? `${ps.env("HOME") ?? "~"}/.config`;
	const layers = [
		await file(fs, `${dir}/.wiz/config.ts`),
		await file(fs, `${home}/wiz/config.ts`),
		environment(ps),
	];
	const settings: Settings = {
		agents: {},
		budget: 100_000,
		batch: 32_000,
		jobs: 4,
	};
	for (const layer of layers) {
		settings.agents = { ...settings.agents, ...layer.agents };
		settings.budget = layer.budget ?? settings.budget;
		settings.batch = layer.batch ?? settings.batch;
		settings.jobs = layer.jobs ?? settings.jobs;
	}
	return settings;
}

async function file(fs: Fs, path: string): Promise<ScryConfig> {
	if (!(await fs.exists(path))) {
		return {};
	}
	// failing beats falling back: a config silently ignored is a check run
	// against agents nobody chose
	const mod = (await import(path).catch((cause: unknown) => {
		throw new Error(`could not load ${path}: ${cause}`, { cause });
	})) as { default?: Config };
	return mod.default?.scry ?? {};
}

function environment(ps: Ps): ScryConfig {
	const agents: Agents = {};
	for (const effort of EFFORTS) {
		const command = ps.env(`WIZ_SCRY_AGENT_${effort.toUpperCase()}`);
		if (command) {
			agents[effort] = command;
		}
	}
	return {
		agents,
		budget: number(ps, "WIZ_SCRY_BUDGET"),
		batch: number(ps, "WIZ_SCRY_BATCH"),
		jobs: number(ps, "WIZ_SCRY_JOBS"),
	};
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

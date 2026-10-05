import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { FakePs } from "webappwiz/system/testing";
import {
	chooseModels,
	DEFAULT_MODELS,
	loadConfig,
	loadCredentialsConfig,
} from "./load-config";

describe("loadConfig", () => {
	const fs = new NodeFs();
	let root: string;
	let ps: FakePs;

	const config = (rules: object) =>
		`export default { scry: ${JSON.stringify(rules)} };\n`;

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "wiz-config-"));
		ps = new FakePs();
		ps.setEnv({ HOME: `${root}/home` });
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("defaults to medium effort and 8 jobs", async () => {
		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			effort: "medium",
			models: DEFAULT_MODELS,
			jobs: 8,
			exclude: [],
		});
	});

	it("lays the user's config over the project's, and the environment over both", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ effort: "low", jobs: 2 }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ effort: "high" }),
		);
		expect(await loadConfig(`${root}/p`, { fs, ps })).toMatchObject({
			effort: "high",
			jobs: 2,
		});

		ps.setEnv({ WIZ_SCRY_EFFORT: "low", WIZ_SCRY_JOBS: "16" });

		expect(await loadConfig(`${root}/p`, { fs, ps })).toMatchObject({
			effort: "low",
			jobs: 16,
		});
	});

	it("lays each model of each effort over the last layer's", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ models: { high: { decider: "jev-latest" } } }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ models: { high: { llm: "claude-fable-5-1" } } }),
		);

		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect(settings.models).toEqual({
			...DEFAULT_MODELS,
			high: { decider: "jev-latest", llm: "claude-fable-5-1" },
		});
	});

	it("chooses the effort's models, less what the command line names", async () => {
		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect(chooseModels(settings, {})).toEqual(DEFAULT_MODELS.medium);
		expect(chooseModels(settings, { effort: "high" })).toEqual(
			DEFAULT_MODELS.high,
		);
		expect(
			chooseModels(settings, { effort: "low", llm: "claude-opus-5-5" }),
		).toEqual({ decider: "clef-flash", llm: "claude-opus-5-5" });
	});

	it("excludes what the project's config and the user's both exclude", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ exclude: ["vendor/**"] }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ exclude: ["scratch/**"] }),
		);

		expect((await loadConfig(`${root}/p`, { fs, ps })).exclude).toEqual([
			"vendor/**",
			"scratch/**",
		]);
	});

	it("reads the user's config from XDG_CONFIG_HOME when it is set", async () => {
		await fs.mkdir(`${root}/xdg/wiz`);
		await fs.write(`${root}/xdg/wiz/config.ts`, config({ jobs: 7 }));
		ps.setEnv({ XDG_CONFIG_HOME: `${root}/xdg` });

		expect((await loadConfig(`${root}/p`, { fs, ps })).jobs).toEqual(7);
	});

	it("refuses settings that no longer do anything, rather than ignore them", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ agents: { medium: "claude -p" }, model: "clef" }),
		);

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"scry.agents, scry.model are gone: scry.models names the models each effort asks, and scry.effort which effort a check runs at",
		);
	});

	it("refuses an effort that is not one", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(`${root}/p/.wiz/config.ts`, config({ effort: "max" }));

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			'scry.effort: expected one of low, medium, high, got "max"',
		);
	});

	it("refuses an effort's models given as a bare name, as scry.models once took them", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ models: { low: "clef" } }),
		);

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"scry.models.low: expected the models it asks",
		);
	});

	it("refuses WIZ_SCRY_MODEL, which effort replaced", async () => {
		ps.setEnv({ WIZ_SCRY_MODEL: "clef" });

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"WIZ_SCRY_MODEL is gone",
		);
	});

	it("refuses a number in the environment that is not one", async () => {
		ps.setEnv({ WIZ_SCRY_JOBS: "lots" });

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			'WIZ_SCRY_JOBS: expected a number, got "lots"',
		);
	});

	it("merges the credentials both configs name", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			'export default { credentials: { project: "shop", names: { STRIPE_SECRET_KEY: "Stripe" } } };\n',
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			'export default { credentials: { names: { SENTRY_TOKEN: "Sentry" } } };\n',
		);

		expect(await loadCredentialsConfig(`${root}/p`, { fs, ps })).toEqual({
			names: { STRIPE_SECRET_KEY: "Stripe", SENTRY_TOKEN: "Sentry" },
		});
	});
});

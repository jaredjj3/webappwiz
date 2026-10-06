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

	/** A model at every effort, as a bare name in a config stands for. */
	const every = <M extends string>(model: M) => ({
		default: model,
		low: model,
		medium: model,
		high: model,
	});
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

	it("defaults to the default models, no profiles and 8 jobs", async () => {
		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			models: DEFAULT_MODELS,
			profiles: {},
			jobs: 8,
			exclude: [],
		});
	});

	it("lays the user's config over the project's, and the environment over both", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ jobs: 2, exclude: ["vendor/**"] }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(`${root}/home/.config/wiz/config.ts`, config({ jobs: 4 }));
		expect((await loadConfig(`${root}/p`, { fs, ps })).jobs).toEqual(4);

		ps.setEnv({ WIZ_SCRY_JOBS: "16" });

		expect((await loadConfig(`${root}/p`, { fs, ps })).jobs).toEqual(16);
	});

	it("lays each model over the last layer's", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ models: { som: "jev-latest" } }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ models: { llm: "claude-fable-5-1" } }),
		);

		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect(settings.models).toEqual({
			som: every("jev-latest"),
			llm: every("claude-fable-5-1"),
		});
	});

	it("lays each effort's model over the last layer's, keeping those it leaves out", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ models: { llm: { default: "claude-fable-5-1" } } }),
		);

		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect(settings.models).toEqual({
			som: DEFAULT_MODELS.som,
			llm: { ...DEFAULT_MODELS.llm, default: "claude-fable-5-1" },
		});
	});

	it("lays a profile's models over the config's, and a later layer's over the profile", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({
				models: { som: "clef" },
				profiles: { "double-check": { som: { high: "jev-latest" } } },
			}),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ profiles: { "double-check": { llm: "claude-opus-5-5" } } }),
		);

		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect([
			chooseModels(settings, {}),
			chooseModels(settings, { profile: "double-check" }),
		]).toEqual([
			{ som: every("clef"), llm: DEFAULT_MODELS.llm },
			{
				som: { ...every("clef"), high: "jev-latest" },
				llm: every("claude-opus-5-5"),
			},
		]);
	});

	it("refuses a profile no config names, saying which do", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ profiles: { "double-check": { som: "jev-latest" } } }),
		);
		const settings = await loadConfig(`${root}/p`, { fs, ps });

		expect(() => chooseModels(settings, { profile: "triple" })).toThrow(
			'no profile "triple": scry.profiles names double-check',
		);
	});

	it.each([
		[
			{ models: { som: 3 } },
			"scry.models.som: expected a model, or one per effort",
		],
		[
			{ models: { som: { default: "clef", max: "jev-latest" } } },
			"scry.models.som.max: expected a model at default, low, medium, high",
		],
		[
			{ profiles: { "double-check": { judge: "jev-latest" } } },
			"scry.profiles.double-check.judge: expected som or llm",
		],
		[
			{ models: { decider: "clef" } },
			"scry.models.decider: decider is now som",
		],
		[
			{ budgets: [{ decider: 1000, per: "day" }] },
			"scry.budgets[0].decider: decider is now som",
		],
	])("refuses models it cannot ask: %j", async (scry, message) => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(`${root}/p/.wiz/config.ts`, config(scry));

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(message);
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
			"scry.agents, scry.model are gone: scry.models names the models a check asks, at each effort a rule's questions ask, and scry.profiles others that --profile picks for one run",
		);
	});

	it("spells the budget presets out, and takes the last layer's budgets whole", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ budgets: [{ llm: 1000, per: "day" }] }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ budgets: "unlimited" }),
		);

		expect((await loadConfig(`${root}/p`, { fs, ps })).budgets).toEqual([
			{ som: "unlimited", llm: "unlimited" },
		]);
	});

	it.each([
		[
			{ budget: 1000 },
			"scry.budget is gone: scry.budgets declares what a check may spend",
		],
		[
			{ budgets: "some" },
			'scry.budgets: expected "nothing", "unlimited", or limits like [{ llm: 2_000_000, per: "month" }]',
		],
		[
			{ budgets: [{ per: "day" }] },
			"scry.budgets[0]: expected som, llm, or both",
		],
		[
			{ budgets: [{ llm: -1, per: "day" }] },
			'scry.budgets[0].llm: expected input tokens, "nothing" or "unlimited", got -1',
		],
		[
			{ budgets: [{ llm: 1000 }] },
			'scry.budgets[0]: a number of tokens needs a window: per "check", "day", "week" or "month", or within, like "7d"',
		],
		[
			{ budgets: [{ llm: 1000, per: "year" }] },
			'scry.budgets[0].per: expected one of check, day, week, month, got "year"',
		],
		[
			{ budgets: [{ llm: 1000, within: "7 days" }] },
			'scry.budgets[0].within: expected hours, days or weeks, like "24h", "7d" or "2w", got "7 days"',
		],
		[
			{ budgets: [{ llm: 1000, per: "day", within: "7d" }] },
			"scry.budgets[0]: expected per or within, not both",
		],
		[
			{ budgets: [{ llm: 1000, per: "day", tokens: 5 }] },
			"scry.budgets[0]: unknown tokens: expected som, llm, per or within",
		],
	])("refuses budgets a check cannot hold to: %j", async (scry, message) => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(`${root}/p/.wiz/config.ts`, config(scry));

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(message);
	});

	it("refuses scry.effort, which picked the models before scry.models named them", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(`${root}/p/.wiz/config.ts`, config({ effort: "high" }));

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"scry.effort is gone",
		);
	});

	it("refuses models named per effort, as scry.models once took them", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ models: { high: { llm: "claude-opus-5-5" } } }),
		);

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"scry.models.high: expected som or llm",
		);
	});

	it.each(["WIZ_SCRY_MODEL", "WIZ_SCRY_EFFORT"])(
		"refuses %s, which scry.models replaced",
		async (name) => {
			ps.setEnv({ [name]: "clef" });

			await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
				`${name} is gone`,
			);
		},
	);

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

import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { FakePs } from "webappwiz/system/testing";
import { loadConfig, loadCredentialsConfig } from "./load-config";

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

	it("defaults to clef and 8 jobs", async () => {
		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			model: "clef",
			jobs: 8,
		});
	});

	it("lays the user's config over the project's, and the environment over both", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({ model: "clef-flash", jobs: 2 }),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ model: "jev-latest" }),
		);
		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			model: "jev-latest",
			jobs: 2,
		});

		ps.setEnv({ WIZ_SCRY_MODEL: "jev-preview", WIZ_SCRY_JOBS: "16" });

		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			model: "jev-preview",
			jobs: 16,
		});
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
			config({ agents: { medium: "claude -p" }, models: { low: "clef" } }),
		);

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			"scry.agents, scry.models are gone: a rule's check asks one decision model now, chosen by scry.model",
		);
	});

	it("refuses a number in the environment that is not one", async () => {
		ps.setEnv({ WIZ_SCRY_JOBS: "lots" });

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			'WIZ_SCRY_JOBS: expected a number, got "lots"',
		);
	});

	it("merges the credentials both configs name, the user's project name over the project's", async () => {
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
			project: "shop",
			names: { STRIPE_SECRET_KEY: "Stripe", SENTRY_TOKEN: "Sentry" },
		});
	});
});

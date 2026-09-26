import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { FakePs } from "webappwiz/system/testing";
import { loadConfig } from "./load-config";

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

	it("defaults to no agents, a budget of 100k, batches of 32k and 4 jobs", async () => {
		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			agents: {},
			budget: 100_000,
			batch: 32_000,
			jobs: 4,
		});
	});

	it("lays the user's config over the project's, one agent at a time, and the environment over both", async () => {
		await fs.mkdir(`${root}/p/.wiz`);
		await fs.write(
			`${root}/p/.wiz/config.ts`,
			config({
				agents: { low: "project-low", medium: "project-medium" },
				batch: 9,
				jobs: 2,
			}),
		);
		await fs.mkdir(`${root}/home/.config/wiz`);
		await fs.write(
			`${root}/home/.config/wiz/config.ts`,
			config({ agents: { medium: "user-medium" }, budget: 5 }),
		);
		ps.setEnv({
			WIZ_SCRY_AGENT_HIGH: "env-high",
			WIZ_SCRY_JOBS: "8",
			WIZ_SCRY_BATCH: "3",
		});

		expect(await loadConfig(`${root}/p`, { fs, ps })).toEqual({
			agents: { low: "project-low", medium: "user-medium", high: "env-high" },
			budget: 5,
			batch: 3,
			jobs: 8,
		});
	});

	it("reads the user's config from XDG_CONFIG_HOME when it is set", async () => {
		await fs.mkdir(`${root}/xdg/wiz`);
		await fs.write(`${root}/xdg/wiz/config.ts`, config({ budget: 7 }));
		ps.setEnv({ XDG_CONFIG_HOME: `${root}/xdg` });

		expect((await loadConfig(`${root}/p`, { fs, ps })).budget).toEqual(7);
	});

	it("refuses a number in the environment that is not one", async () => {
		ps.setEnv({ WIZ_SCRY_BUDGET: "lots" });

		await expect(loadConfig(`${root}/p`, { fs, ps })).rejects.toThrow(
			'WIZ_SCRY_BUDGET: expected a number, got "lots"',
		);
	});
});

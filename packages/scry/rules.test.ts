import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs } from "webappwiz/system";
import { Rules } from "./rules";
import { ruleSource } from "./testing";

describe("Rules", () => {
	const fs = new NodeFs();
	let root: string;

	const install = async (id: string, source = ruleSource()) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(`${root}/.wiz/scry/${id}/rule.ts`, source);
	};

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-load-"));
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("loads every rule under .wiz/scry, in id order", async () => {
		await install("zeta");
		await install("alpha");

		const rules = await Rules.load(root, { fs });

		expect(rules.all.map((rule) => rule.id)).toEqual(["alpha", "zeta"]);
	});

	it("reads each rule's settings off its class, with defaults for the ones it leaves out", async () => {
		await install(
			"alpha",
			`export default class {
				static description = "No alpha.";
				async check() { return []; }
			}`,
		);
		await install(
			"beta",
			ruleSource(undefined, {
				description: "No beta.",
				files: "**/*.md",
				level: "warning",
				threshold: 0.5,
				recommended: true,
			}),
		);

		const rules = await Rules.load(root, { fs });

		expect(
			rules.all.map(
				({ id, description, files, level, threshold, recommended }) => ({
					id,
					description,
					files,
					level,
					threshold,
					recommended,
				}),
			),
		).toEqual([
			{
				id: "alpha",
				description: "No alpha.",
				files: "**/*",
				level: "error",
				threshold: 0.7,
				recommended: false,
			},
			{
				id: "beta",
				description: "No beta.",
				files: "**/*.md",
				level: "warning",
				threshold: 0.5,
				recommended: true,
			},
		]);
	});

	it("has no rules when the project has no .wiz/scry", async () => {
		expect((await Rules.load(root, { fs })).all).toEqual([]);
	});

	it("skips dotfiles the directory picked up", async () => {
		await install("alpha");
		await fs.write(`${root}/.wiz/scry/.DS_Store`, "");

		expect((await Rules.load(root, { fs })).all.map((rule) => rule.id)).toEqual(
			["alpha"],
		);
	});

	it("reports every broken rule at once, by path", async () => {
		await install("alpha", ruleSource(undefined, { level: "loud" as "error" }));
		await install(
			"beta",
			"export default class { async check() { return []; } }\n",
		);
		await fs.mkdir(`${root}/.wiz/scry/empty`);
		await fs.write(`${root}/.wiz/scry/empty/RULE.md`, "# Empty\n");
		await install("gamma", "export const nothing = 1;\n");
		await install("delta", ruleSource(undefined, { threshold: 2 }));
		await install("No_Kebab");

		await expect(Rules.load(root, { fs })).rejects.toThrow(
			[
				'.wiz/scry/No_Kebab/rule.ts: "No_Kebab" is not kebab case',
				".wiz/scry/alpha/rule.ts: static level: expected one of error, warning",
				".wiz/scry/beta/rule.ts: static description: missing: one line saying what the rule expects",
				".wiz/scry/delta/rule.ts: static threshold: expected a number from 0 to 1",
				".wiz/scry/empty/rule.ts: missing",
				".wiz/scry/gamma/rule.ts: does not default-export the rule's class",
			].join("\n"),
		);
	});

	it("reports a rule.ts that fails to import as broken", async () => {
		await install("alpha", "export default class {\n");

		await expect(Rules.load(root, { fs })).rejects.toThrow(
			/^\.wiz\/scry\/alpha\/rule\.ts: /,
		);
	});

	it("finds a rule by id", async () => {
		await install("alpha");

		const rules = await Rules.load(root, { fs });

		expect(rules.get("alpha")?.id).toEqual("alpha");
		expect(rules.get("beta")).toBeUndefined();
	});
});

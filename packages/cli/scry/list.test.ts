import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ruleDoc, ruleSource } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs } from "webappwiz/system";
import { list } from "./list";

describe("scry list", () => {
	const fs = new NodeFs();
	let root: string;
	let log: MemoryLogger;
	const rules = {
		"no-foo": {
			rule: class {
				static description = "No foo.";
				static files = "**/*.ts";
				static recommended = true;
				async check() {
					return [];
				}
			},
			files: {
				"RULE.md": ruleDoc("no-foo", { version: "1.0.0" }),
				"rule.ts": "export default class NoFoo {}\n",
			},
		},
		"no-bar": {
			rule: class {
				static description = "No bar.";
				static files = "**/*.md";
				static level = "warning" as const;
				async check() {
					return [];
				}
			},
			files: { "RULE.md": ruleDoc("no-bar", { version: "1.0.0" }) },
		},
	};

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

	/** Installs a rule whose class is `source`, beside a `RULE.md` stamped with `version`. */
	const install = async (id: string, source: string, version?: string) => {
		await fs.mkdir(`${root}/.wiz/scry/${id}`);
		await fs.write(`${root}/.wiz/scry/${id}/RULE.md`, ruleDoc(id, { version }));
		await fs.write(`${root}/.wiz/scry/${id}/rule.ts`, source);
	};

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "scry-list-"));
		log = new MemoryLogger();
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("lists every shipped rule with what a review needs to know of it", async () => {
		await list({ dir: root, log, fs, rules });

		expect(printed()).toEqual(
			[
				"rule     level     recommended   files     ships   installed   description",
				"no-bar   warning   -             **/*.md   1.0.0   -           No bar.",
				"no-foo   error     yes           **/*.ts   1.0.0   -           No foo.",
			].join("\n"),
		);
	});

	it("shows the version a copy came from beside the one that ships", async () => {
		await install(
			"no-foo",
			ruleSource(undefined, { description: "No foo." }),
			"0.9.0",
		);

		await list({ dir: root, log, fs, rules });

		expect(printed()).toContain(
			"no-foo   error     yes           **/*.ts   1.0.0   0.9.0       No foo.",
		);
		expect(printed()).toContain("1 out of date: run `scry update`");
	});

	it("lists a rule the project wrote itself as local", async () => {
		await install("mine", ruleSource(undefined, { description: "Mine." }));

		await list({ dir: root, log, fs, rules });

		expect(printed()).toContain(
			"mine     error     -             **/*.ts   -       local       Mine.",
		);
		expect(printed()).not.toContain("out of date");
	});

	it("describes a copied rule the way the copy's class does, not the shipped one", async () => {
		await install(
			"no-foo",
			ruleSource(undefined, { description: "Edited.", level: "warning" }),
			"1.0.0",
		);

		await list({ dir: root, log, fs, rules });

		expect(printed()).toContain(
			"no-foo   warning   yes           **/*.ts   1.0.0   1.0.0       Edited.",
		);
		expect(printed()).not.toContain("No foo.");
	});

	it("refuses to list a project whose rules do not load", async () => {
		await install(
			"broken",
			ruleSource(undefined, { level: "loud" as "error" }),
		);

		await expect(list({ dir: root, log, fs, rules })).rejects.toThrow(
			".wiz/scry/broken/rule.ts: static level: expected one of error, warning",
		);
	});
});

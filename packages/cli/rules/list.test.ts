import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/rules/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { list } from "./list";

describe("rules list", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const rules = {
		"no-foo": ruleDoc("no-foo", {
			description: "No foo.",
			complexity: "low",
			recommended: true,
			version: "1.0.0",
		}),
		"no-bar": ruleDoc("no-bar", {
			description: "No bar.",
			files: "**/*.md",
			level: "warning",
			version: "1.0.0",
		}),
	};

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/rules/${id}`);
		await fs.write(`/p/.wiz/rules/${id}/RULE.md`, doc);
	};

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("lists every shipped rule with what a review needs to know of it", async () => {
		await list({ dir: "/p", log, fs, rules });

		expect(printed()).toEqual(
			[
				"rule     level     complexity   recommended   files     ships   installed   description",
				"no-bar   warning   medium       -             **/*.md   1.0.0   -           No bar.",
				"no-foo   error     low          yes           **/*.ts   1.0.0   -           No foo.",
			].join("\n"),
		);
	});

	it("shows the version a copy came from beside the one that ships", async () => {
		await install("no-foo", ruleDoc("no-foo", { version: "0.9.0" }));

		await list({ dir: "/p", log, fs, rules });

		expect(printed()).toContain(
			"no-foo   error     medium       yes           **/*.ts   1.0.0   0.9.0",
		);
		expect(printed()).toContain("1 out of date: run `rules update`");
	});

	it("lists a rule the project wrote itself as local", async () => {
		await install("mine", ruleDoc("mine", { description: "Mine." }));

		await list({ dir: "/p", log, fs, rules });

		expect(printed()).toContain(
			"mine     error     medium       -             **/*.ts   -       local       Mine.",
		);
		expect(printed()).not.toContain("out of date");
	});

	it("describes a copied rule the way the copy does, not the shipped one", async () => {
		await install(
			"no-foo",
			ruleDoc("no-foo", { description: "Edited.", version: "1.0.0" }),
		);

		await list({ dir: "/p", log, fs, rules });

		expect(printed()).toContain("Edited.");
		expect(printed()).not.toContain("No foo.");
	});

	it("refuses to list a project whose rules do not parse", async () => {
		await install(
			"broken",
			ruleDoc("broken").replace("level: error", "level: loud"),
		);

		await expect(list({ dir: "/p", log, fs, rules })).rejects.toThrow(
			".wiz/rules/broken/RULE.md:5: level: expected one of error, warning",
		);
	});
});

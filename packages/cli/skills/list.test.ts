import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";

import { list } from "./list";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills list", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

	const listing = () => ({
		dir: "/p",
		version: "1.0.0",
		skills: ["other", "arbor"],
		log,
		fs,
		ps: new FakePs(),
	});

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("lists every skill there is by name, and marks the ones not installed", async () => {
		await list(listing());

		expect(printed()).toEqual(
			[
				"skill   ships   installed",
				"arbor   1.0.0   -",
				"other   1.0.0   -",
			].join("\n"),
		);
	});

	it("reports the version a project actually holds", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor", "0.9.0"));

		await list(listing());

		expect(printed()).toContain("arbor   1.0.0   0.9.0");
		expect(printed()).toContain("1 out of date: run `skills update`");
	});

	it("says nothing about updating when what is installed is current", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));

		await list(listing());

		expect(printed()).toContain("arbor   1.0.0   1.0.0");
		expect(printed()).not.toContain("out of date");
	});

	it("marks a copy linked to one kept by hand, and never calls it out of date", async () => {
		await fs.write("/p/skills/arbor/SKILL.md", md("arbor", "0.9.0"));
		await fs.symlink(
			"../../../skills/arbor/SKILL.md",
			"/p/.agents/skills/arbor/SKILL.md",
		);

		await list(listing());

		expect(printed()).toContain("arbor   1.0.0   0.9.0 (linked)");
		expect(printed()).not.toContain("out of date");
	});
});

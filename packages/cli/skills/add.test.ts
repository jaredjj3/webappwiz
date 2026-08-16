import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs } from "@webappwiz/system/testing";

import { add } from "./add";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills add", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const skills = { arbor: md("arbor"), other: md("other") };

	const adding = (skill: string) => ({ dir: "/p", skill, log, fs, skills });

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("copies the named skill to <name>/SKILL.md", async () => {
		await add(adding("arbor"));

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("leaves the skills it was not asked to add alone", async () => {
		await add(adding("arbor"));

		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("rejects a skill that does not exist, and says what there is", async () => {
		await expect(add(adding("nope"))).rejects.toThrow(
			"no such skill: nope (have arbor, other)",
		);
	});

	it("overwrites whatever is already there", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await add(adding("arbor"));

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});
});

import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs } from "@webappwiz/system/testing";

import { add } from "./add";
import { source } from "./skill";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills add", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir(source);
		for (const name of ["arbor", "other"]) {
			await fs.write(`${source}/${name}.skill.md`, md(name));
		}
		// not a skill: templates that are not `.skill.md` live alongside them
		await fs.write(`${source}/plain-doc.md`, "not a skill");
	});

	it("copies the named skill to <name>/SKILL.md", async () => {
		await add({ dir: "/p", skill: "arbor", log: log, fs: fs });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("does not offer templates that are not skills", async () => {
		await expect(
			add({ dir: "/p", skill: "plain-doc", log: log, fs: fs }),
		).rejects.toThrow("no such skill: plain-doc (have arbor, other)");
	});

	it("leaves the skills it was not asked to add alone", async () => {
		await add({ dir: "/p", skill: "arbor", log: log, fs: fs });

		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("rejects a skill that does not exist, and says what there is", async () => {
		await expect(
			add({ dir: "/p", skill: "nope", log: log, fs: fs }),
		).rejects.toThrow("no such skill: nope (have arbor, other)");
	});

	it("overwrites whatever is already there", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await add({ dir: "/p", skill: "arbor", log: log, fs: fs });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});
});

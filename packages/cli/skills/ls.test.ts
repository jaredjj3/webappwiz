import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { FakeFs } from "@webappwiz/system/testing";

import { ls } from "./ls";
import { source } from "./skill";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills ls", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

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

	it("lists every skill there is, and marks the ones not installed", async () => {
		await ls({ dir: "/p", log: log, fs: fs });

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

		await ls({ dir: "/p", log: log, fs: fs });

		expect(printed()).toContain("arbor   1.0.0   0.9.0");
		expect(printed()).toContain("1 out of date: run `skills update`");
	});

	it("says nothing about updating when what is installed is current", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));

		await ls({ dir: "/p", log: log, fs: fs });

		expect(printed()).toContain("arbor   1.0.0   1.0.0");
		expect(printed()).not.toContain("out of date");
	});
});

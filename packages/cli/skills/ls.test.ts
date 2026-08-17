import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";

import { ls } from "./ls";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills ls", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const skills = { other: md("other"), arbor: md("arbor") };

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

	const listing = () => ({ dir: "/p", log, fs, skills });

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("lists every skill there is by name, and marks the ones not installed", async () => {
		await ls(listing());

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

		await ls(listing());

		expect(printed()).toContain("arbor   1.0.0   0.9.0");
		expect(printed()).toContain("1 out of date: run `skills update`");
	});

	it("says nothing about updating when what is installed is current", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));

		await ls(listing());

		expect(printed()).toContain("arbor   1.0.0   1.0.0");
		expect(printed()).not.toContain("out of date");
	});

	it("says so when a skill ships without a version in its frontmatter", async () => {
		await ls({ dir: "/p", log, fs, skills: { arbor: "# no frontmatter" } });

		expect(printed()).toContain("arbor   ?       -");
	});
});

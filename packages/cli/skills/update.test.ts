import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";

import { update } from "./update";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const skills = { arbor: md("arbor"), other: md("other") };

	const updating = () => ({ dir: "/p", log, fs, skills });

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
	});

	it("refreshes the skills the project has", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await update(updating());

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("does not add a skill the project chose not to install", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await update(updating());

		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("ignores skills that are not ours", async () => {
		await fs.mkdir("/p/.agents/skills/theirs");
		await fs.write("/p/.agents/skills/theirs/SKILL.md", "theirs");

		await update(updating());

		expect(await fs.read("/p/.agents/skills/theirs/SKILL.md")).toEqual(
			"theirs",
		);
	});

	it("says so when a project has no skills to update, rather than failing", async () => {
		await update(updating());

		expect(String(log.entries.at(-1)?.message)).toContain(
			"no webappwiz skills in /p",
		);
	});
});

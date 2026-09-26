import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";

import { retired as defaultRetired } from "./skill";
import { update } from "./update";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills update", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	const skills = {
		arbor: { "SKILL.md": md("arbor") },
		other: { "SKILL.md": md("other") },
	};

	const retired = {
		old: { now: "other", description: /^Old words/ },
	};

	const updating = () => ({ dir: "/p", log, fs, skills, retired });

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

	it("replaces our copy of a renamed skill with what it became", async () => {
		await fs.mkdir("/p/.agents/skills/old");
		await fs.write(
			"/p/.agents/skills/old/SKILL.md",
			'---\nname: old\ndescription: "Old words, as shipped."\n---\n',
		);

		await update(updating());

		expect(await fs.exists("/p/.agents/skills/old")).toBe(false);
		expect(await fs.read("/p/.agents/skills/other/SKILL.md")).toEqual(
			md("other"),
		);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"removed /p/.agents/skills/old: old is now other",
			"wrote /p/.agents/skills/other/SKILL.md",
		]);
	});

	it("leaves a project's own skill alone when it only shares a retired name", async () => {
		await fs.mkdir("/p/.agents/skills/old");
		await fs.write(
			"/p/.agents/skills/old/SKILL.md",
			"---\nname: old\ndescription: Mine.\n---\n",
		);

		await update(updating());

		expect(await fs.exists("/p/.agents/skills/old/SKILL.md")).toBe(true);
		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("retires review in favor of scry", () => {
		const { review } = defaultRetired;

		expect(review?.now).toEqual("scry");
		expect(
			review?.description.test(
				"Review a change against the RULE.md rules in this project's .wiz/rules directory by handing blocks of rules to separate agents.",
			),
		).toBe(true);
	});
});

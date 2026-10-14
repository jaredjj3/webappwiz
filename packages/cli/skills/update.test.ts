import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs, FakePs } from "webappwiz/system/testing";

import { retired as defaultRetired } from "./skill";
import { update } from "./update";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills update", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;

	const retired = {
		old: { now: "other", description: /^Old words/ },
	};

	const updating = () => ({
		dir: "/p",
		version: "1.0.0",
		skills: ["arbor", "other"],
		log,
		fs,
		ps,
		retired,
	});
	const installing = (...names: string[]) =>
		`bunx skills@1 add jaredjj3/webappwiz#v1.0.0 --yes --skill ${names.join(" ")}`;

	beforeEach(() => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
	});

	it("refreshes only the skills the project has, from the release's tag", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor", "0.9.0"));
		await fs.mkdir("/p/.agents/skills/theirs");
		await fs.write("/p/.agents/skills/theirs/SKILL.md", "theirs");

		await update(updating());

		expect(ps.getCalls()).toEqual([installing("arbor")]);
	});

	it("leaves a skill linked to one kept by hand", async () => {
		await fs.write("/p/skills/arbor/SKILL.md", md("arbor", "0.9.0"));
		await fs.symlink(
			"../../../skills/arbor/SKILL.md",
			"/p/.agents/skills/arbor/SKILL.md",
		);

		await update(updating());

		expect(ps.getCalls()).toEqual([]);
		expect(log.entries.map((entry) => entry.message)).toContain(
			".agents/skills/arbor links to your own copy; leaving it",
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
		expect(ps.getCalls()).toEqual([installing("other")]);
		expect(log.entries.map((entry) => entry.message)).toContain(
			"removed /p/.agents/skills/old: old is now other",
		);
	});

	it("leaves a project's own skill alone when it only shares a retired name", async () => {
		await fs.mkdir("/p/.agents/skills/old");
		await fs.write(
			"/p/.agents/skills/old/SKILL.md",
			"---\nname: old\ndescription: Mine.\n---\n",
		);

		await update(updating());

		expect(await fs.exists("/p/.agents/skills/old/SKILL.md")).toBe(true);
		expect(ps.getCalls()).toEqual([]);
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

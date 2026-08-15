import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { FakeFs } from "@webappwiz/sys/testing";

import { Skills, source, versionOf } from "./skills";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	let skills: Skills;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		skills = new Skills({ log: log, fs: fs });
		await fs.mkdir(source);
		for (const name of ["arbor", "other"]) {
			await fs.write(`${source}/${name}.skill.md`, md(name));
		}
		// not a skill: templates that are not `.skill.md` live alongside them
		await fs.write(`${source}/plain-doc.md`, "not a skill");
	});

	it("lists every skill there is, and marks the ones not installed", async () => {
		await skills.ls({ dir: "/p" });

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

		await skills.ls({ dir: "/p" });

		expect(printed()).toContain("arbor   1.0.0   0.9.0");
		expect(printed()).toContain("1 out of date: run `skills update`");
	});

	it("says nothing about updating when what is installed is current", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));

		await skills.ls({ dir: "/p" });

		expect(printed()).toContain("arbor   1.0.0   1.0.0");
		expect(printed()).not.toContain("out of date");
	});

	it("copies the named skill to <name>/SKILL.md when adding", async () => {
		await skills.add({ dir: "/p", skill: "arbor" });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("does not offer templates that are not skills", async () => {
		await expect(skills.add({ dir: "/p", skill: "plain-doc" })).rejects.toThrow(
			"no such skill: plain-doc (have arbor, other)",
		);
	});

	it("leaves the skills it was not asked to add alone", async () => {
		await skills.add({ dir: "/p", skill: "arbor" });

		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("rejects a skill that does not exist, and says what there is", async () => {
		await expect(skills.add({ dir: "/p", skill: "nope" })).rejects.toThrow(
			"no such skill: nope (have arbor, other)",
		);
	});

	it("overwrites whatever is already there when adding", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await skills.add({ dir: "/p", skill: "arbor" });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("refreshes the skills the project has when updating", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await skills.update({ dir: "/p" });

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
	});

	it("does not add a skill the project chose not to install", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await skills.update({ dir: "/p" });

		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("ignores skills that are not ours when updating", async () => {
		await fs.mkdir("/p/.agents/skills/theirs");
		await fs.write("/p/.agents/skills/theirs/SKILL.md", "theirs");

		await skills.update({ dir: "/p" });

		expect(await fs.read("/p/.agents/skills/theirs/SKILL.md")).toEqual(
			"theirs",
		);
	});

	it("says so when a project has no skills to update, rather than failing", async () => {
		await skills.update({ dir: "/p" });

		expect(String(log.entries.at(-1)?.message)).toContain(
			"no webappwiz skills in /p",
		);
	});

	it("reads the version out of the frontmatter", () => {
		expect(versionOf(md("arbor", "2.1.0"))).toEqual("2.1.0");
	});

	it("ignores a version: line in the body", () => {
		expect(versionOf(`---\nname: x\n---\n\nversion: 9.9.9\n`)).toBeNull();
	});

	it("finds no version when there is no frontmatter at all", () => {
		expect(versionOf("# just a doc")).toBeNull();
	});

	it("stamps the package version in every bundled skill's frontmatter", async () => {
		// the frontmatter version is the only way a project can tell which
		// release of these packages its copy came from, so it must track the
		// package version exactly
		const real = new NodeFs();
		const { version } = JSON.parse(
			await real.read(`${import.meta.dirname}/package.json`),
		);
		const root = JSON.parse(
			await real.read(`${import.meta.dirname}/../../package.json`),
		);
		expect(root.version).toEqual(version);

		const files = (await real.readdir(source)).filter((file) =>
			file.endsWith(".skill.md"),
		);
		expect(files.length).toBeGreaterThan(0);
		for (const file of files) {
			const skill = await real.read(`${source}/${file}`);
			expect(versionOf(skill)).toEqual(version);
		}
	});
});

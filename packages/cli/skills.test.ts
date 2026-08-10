import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { FakeFs } from "@webappwiz/sys/testing";

import { skills, source } from "./skills";

describe("skills", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir(source);
		for (const name of ["arbor", "other"]) {
			await fs.mkdir(`${source}/${name}`);
			await fs.write(`${source}/${name}/SKILL.md`, `# ${name}`);
		}
		await fs.mkdir(`${source}/arbor/references`);
		await fs.write(`${source}/arbor/references/deep.md`, "deep");
	});

	it("copies every skill, including nested files", async () => {
		await skills({ dir: "/p", skill: "" }, log, fs);

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			"# arbor",
		);
		expect(await fs.read("/p/.agents/skills/arbor/references/deep.md")).toEqual(
			"deep",
		);
		expect(await fs.read("/p/.agents/skills/other/SKILL.md")).toEqual(
			"# other",
		);
	});

	it("copies only the named skill", async () => {
		await skills({ dir: "/p", skill: "other" }, log, fs);

		expect(await fs.exists("/p/.agents/skills/arbor/SKILL.md")).toBe(false);
		expect(await fs.read("/p/.agents/skills/other/SKILL.md")).toEqual(
			"# other",
		);
	});

	it("rejects a skill that does not exist", async () => {
		await expect(skills({ dir: "/p", skill: "nope" }, log, fs)).rejects.toThrow(
			"no such skill: nope",
		);
	});

	it("overwrites whatever is already there", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

		await skills({ dir: "/p", skill: "arbor" }, log, fs);

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			"# arbor",
		);
	});
});

// The version in a skill's frontmatter is the only way a project can tell which
// release of these packages its copy came from, so it has to track the package.
describe("bundled skills", () => {
	const fs = new NodeFs();

	it("stamp the package version in their frontmatter", async () => {
		const { version } = JSON.parse(
			await fs.read(`${import.meta.dir}/package.json`),
		);
		const root = JSON.parse(
			await fs.read(`${import.meta.dir}/../../package.json`),
		);
		expect(root.version).toEqual(version);

		const names = await fs.readdir(source);
		expect(names.length).toBeGreaterThan(0);
		for (const name of names) {
			const md = await fs.read(`${source}/${name}/SKILL.md`);
			expect(md).toContain(`\nversion: ${version}\n`);
		}
	});
});

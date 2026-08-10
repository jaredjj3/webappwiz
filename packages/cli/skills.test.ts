import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { FakeFs } from "@webappwiz/sys/testing";

import { add, source, update } from "./skills";

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

	describe("add", () => {
		it("copies the named skill, including nested files", async () => {
			await add({ dir: "/p", skill: "arbor" }, log, fs);

			expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
				"# arbor",
			);
			expect(
				await fs.read("/p/.agents/skills/arbor/references/deep.md"),
			).toEqual("deep");
		});

		it("leaves the skills it was not asked for alone", async () => {
			await add({ dir: "/p", skill: "arbor" }, log, fs);

			expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
		});

		it("rejects a skill that does not exist, and says what there is", async () => {
			await expect(add({ dir: "/p", skill: "nope" }, log, fs)).rejects.toThrow(
				"no such skill: nope (have arbor, other)",
			);
		});

		it("overwrites whatever is already there", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

			await add({ dir: "/p", skill: "arbor" }, log, fs);

			expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
				"# arbor",
			);
		});
	});

	describe("update", () => {
		it("refreshes the skills the project has", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

			await update({ dir: "/p" }, log, fs);

			expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
				"# arbor",
			);
		});

		it("does not add a skill the project chose not to install", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

			await update({ dir: "/p" }, log, fs);

			expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
		});

		it("ignores skills that are not ours", async () => {
			await fs.mkdir("/p/.agents/skills/theirs");
			await fs.write("/p/.agents/skills/theirs/SKILL.md", "theirs");

			await update({ dir: "/p" }, log, fs);

			expect(await fs.read("/p/.agents/skills/theirs/SKILL.md")).toEqual(
				"theirs",
			);
		});

		it("says so when a project has none, rather than failing", async () => {
			await update({ dir: "/p" }, log, fs);

			expect(String(log.entries.at(-1)?.message)).toContain(
				"no webappwiz skills in /p",
			);
		});
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

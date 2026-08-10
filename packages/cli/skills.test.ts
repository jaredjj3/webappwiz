import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeFs } from "@webappwiz/sys";
import { FakeFs } from "@webappwiz/sys/testing";

import { add, ls, source, update, versionOf } from "./skills";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("skills", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const printed = () => log.entries.map((e) => String(e.message)).join("\n");

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir(source);
		for (const name of ["arbor", "other"]) {
			await fs.mkdir(`${source}/${name}`);
			await fs.write(`${source}/${name}/SKILL.md`, md(name));
		}
		await fs.mkdir(`${source}/arbor/references`);
		await fs.write(`${source}/arbor/references/deep.md`, "deep");
	});

	describe("ls", () => {
		it("lists every skill there is, and marks the ones not installed", async () => {
			await ls({ dir: "/p" }, log, fs);

			expect(printed()).toEqual(
				["SKILL  SHIPS  INSTALLED", "arbor  1.0.0  -", "other  1.0.0  -"].join(
					"\n",
				),
			);
		});

		it("reports the version a project actually holds", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor", "0.9.0"));

			await ls({ dir: "/p" }, log, fs);

			expect(printed()).toContain("arbor  1.0.0  0.9.0");
			expect(printed()).toContain("1 out of date — run `skills update`");
		});

		it("says nothing about updating when what is installed is current", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));

			await ls({ dir: "/p" }, log, fs);

			expect(printed()).toContain("arbor  1.0.0  1.0.0");
			expect(printed()).not.toContain("out of date");
		});
	});

	describe("add", () => {
		it("copies the named skill, including nested files", async () => {
			await add({ dir: "/p", skill: "arbor" }, log, fs);

			expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
				md("arbor"),
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
				md("arbor"),
			);
		});
	});

	describe("update", () => {
		it("refreshes the skills the project has", async () => {
			await fs.mkdir("/p/.agents/skills/arbor");
			await fs.write("/p/.agents/skills/arbor/SKILL.md", "stale");

			await update({ dir: "/p" }, log, fs);

			expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
				md("arbor"),
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

describe("versionOf", () => {
	it("reads the version out of the frontmatter", () => {
		expect(versionOf(md("arbor", "2.1.0"))).toEqual("2.1.0");
	});

	it("ignores a version: line in the body", () => {
		expect(versionOf(`---\nname: x\n---\n\nversion: 9.9.9\n`)).toBeNull();
	});

	it("is null when there is no frontmatter at all", () => {
		expect(versionOf("# just a doc")).toBeNull();
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
			expect(versionOf(md)).toEqual(version);
		}
	});
});

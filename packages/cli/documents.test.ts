import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { Documents, versionOf } from "./documents";

const md = (name: string, version = "1.0.0") =>
	`---\nname: ${name}\nversion: ${version}\n---\n\n# ${name}\n`;

describe("Documents", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	let documents: Documents;

	beforeEach(() => {
		fs = new FakeFs();
		log = new MemoryLogger();
		documents = new Documents(
			{ other: md("other"), arbor: md("arbor") },
			{ root: ".agents/skills", file: "SKILL.md", noun: "skill" },
			{ log, fs },
		);
	});

	it("lists what it bundles in name order", () => {
		expect(documents.available().map(([name]) => name)).toEqual([
			"arbor",
			"other",
		]);
	});

	it("installs a copy under the root, in a directory named for it", async () => {
		await documents.add("arbor", "/p");

		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
		expect(log.entries.map((entry) => entry.message)).toEqual([
			"wrote /p/.agents/skills/arbor/SKILL.md",
		]);
	});

	it("rejects a name it does not bundle, and says what there is", async () => {
		await expect(documents.add("nope", "/p")).rejects.toThrow(
			"no such skill: nope (have arbor, other)",
		);
	});

	it("reports the names a project holds, ours or not", async () => {
		await fs.mkdir("/p/.agents/skills/zeta");
		await fs.write("/p/.agents/skills/zeta/SKILL.md", md("zeta"));
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor"));
		await fs.mkdir("/p/.agents/skills/empty");

		expect(await documents.installed("/p")).toEqual(["arbor", "zeta"]);
	});

	it("holds nothing when the root is not there", async () => {
		expect(await documents.installed("/p")).toEqual([]);
	});

	it("reads the version a copy came from, and null for no copy", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor", "0.9.0"));

		expect(await documents.installedVersion("/p", "arbor")).toEqual("0.9.0");
		expect(await documents.installedVersion("/p", "other")).toBeNull();
	});

	it("refreshes the copies a project has, and only those", async () => {
		await fs.mkdir("/p/.agents/skills/arbor");
		await fs.write("/p/.agents/skills/arbor/SKILL.md", md("arbor", "0.9.0"));
		await fs.mkdir("/p/.agents/skills/mine");
		await fs.write("/p/.agents/skills/mine/SKILL.md", "mine");

		expect(await documents.update("/p")).toEqual(["arbor"]);
		expect(await fs.read("/p/.agents/skills/arbor/SKILL.md")).toEqual(
			md("arbor"),
		);
		expect(await fs.read("/p/.agents/skills/mine/SKILL.md")).toEqual("mine");
		expect(await fs.exists("/p/.agents/skills/other/SKILL.md")).toBe(false);
	});

	it("reads a version out of frontmatter alone, never the body", () => {
		expect(versionOf(md("arbor", "2.0.0"))).toEqual("2.0.0");
		expect(versionOf("---\nname: x\n---\n\nversion: 9.9.9\n")).toBeNull();
	});
});

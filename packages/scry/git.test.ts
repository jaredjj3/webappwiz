import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { NodeFs, NodePs } from "webappwiz/system";
import { Git } from "./git";

describe("Git", () => {
	const fs = new NodeFs();
	const ps = new NodePs();
	let root: string;
	let git: Git;

	const run = async (...args: string[]) => {
		await ps.spawnCapture(["git", "-C", root, ...args]);
	};

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rules-git-"));
		await run("init", "-q", "-b", "main");
		await run("config", "user.email", "t@example.com");
		await run("config", "user.name", "T");
		await fs.write(`${root}/kept.ts`, "one\n");
		await fs.write(`${root}/gone.ts`, "gone\n");
		await run("add", ".");
		await run("commit", "-qm", "base");
		git = new Git(root, { ps });
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it("covers the uncommitted work when there is any, new files included and deleted ones not", async () => {
		await fs.write(`${root}/kept.ts`, "two\n");
		await fs.write(`${root}/new.ts`, "fresh\n");
		await run("rm", "-q", "gone.ts");

		const changes = await git.changes();

		expect(changes.since).toEqual("HEAD");
		expect(changes.files.map((file) => file.path)).toEqual([
			"kept.ts",
			"new.ts",
		]);
		expect(changes.files[0]?.diff).toContain("+two");
		expect(changes.files[1]?.diff).toContain("+fresh");
	});

	it("covers the branch since it left trunk when the tree is clean", async () => {
		await run("checkout", "-qb", "feature");
		await fs.write(`${root}/kept.ts`, "branch\n");
		await run("commit", "-qam", "change");

		const changes = await git.changes();

		expect(changes.since).toEqual("main");
		expect(changes.files.map((file) => file.path)).toEqual(["kept.ts"]);
	});

	it("measures from the ref it is given", async () => {
		await fs.write(`${root}/kept.ts`, "later\n");
		await run("commit", "-qam", "later");

		const changes = await git.changes("HEAD~1");

		expect(changes.since).toEqual("HEAD~1");
		expect(changes.files.map((file) => file.path)).toEqual(["kept.ts"]);
	});

	it("keeps only the files at or under the paths it is given, new ones included", async () => {
		await fs.mkdir(`${root}/src/deep`);
		await fs.mkdir(`${root}/srcs`);
		await fs.write(`${root}/kept.ts`, "two\n");
		await fs.write(`${root}/src/deep/new.ts`, "fresh\n");
		await fs.write(`${root}/srcs/other.ts`, "other\n");

		const changes = await git.changes(undefined, ["src"]);

		expect(changes.files.map((file) => file.path)).toEqual(["src/deep/new.ts"]);
	});

	it("measures from trunk when the uncommitted work is all outside the paths", async () => {
		await run("checkout", "-qb", "topic");
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/a.ts`, "a\n");
		await run("add", ".");
		await run("commit", "-qm", "a");
		await fs.write(`${root}/kept.ts`, "two\n");

		const changes = await git.changes(undefined, ["src"]);

		expect(changes.since).toEqual("main");
		expect(changes.files.map((file) => file.path)).toEqual(["src/a.ts"]);
	});

	it("locates the root, and turns paths from a directory inside it into paths from the root", async () => {
		await fs.mkdir(`${root}/src/deep`);
		const top = (
			await ps.spawnCapture(["git", "-C", root, "rev-parse", "--show-toplevel"])
		).stdout.trim();

		expect(
			await Git.locate(`${root}/src`, ["deep", "../kept.ts", "."], { ps }),
		).toEqual({ root: top, paths: ["src/deep", "kept.ts", "src"] });
		await expect(Git.locate(`${root}/src`, ["../.."], { ps })).rejects.toThrow(
			"../.. is outside the repository",
		);
	});
});

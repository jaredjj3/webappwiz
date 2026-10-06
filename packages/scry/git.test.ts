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

	it("covers the uncommitted work since HEAD, new files included and deleted ones not", async () => {
		await fs.write(`${root}/kept.ts`, "two\n");
		await fs.write(`${root}/new.ts`, "fresh\n");
		await run("rm", "-q", "gone.ts");

		const changes = await git.changes("HEAD");

		expect(changes.since).toEqual("HEAD");
		expect(changes.files.map((file) => file.path)).toEqual([
			"kept.ts",
			"new.ts",
		]);
		expect(changes.files[0]?.diff).toContain("+two");
		expect(changes.files[1]?.diff).toContain("+fresh");
	});

	it("measures from the ref it is given", async () => {
		await fs.write(`${root}/kept.ts`, "later\n");
		await run("commit", "-qam", "later");

		const changes = await git.changes("HEAD~1");

		expect(changes.since).toEqual("HEAD~1");
		expect(changes.files.map((file) => file.path)).toEqual(["kept.ts"]);
	});

	it("measures from where the branch left the ref, not what landed on it since", async () => {
		await run("checkout", "-qb", "feature");
		await fs.write(`${root}/new.ts`, "branch\n");
		await run("add", "new.ts");
		await run("commit", "-qm", "branch");
		await run("checkout", "-q", "main");
		await fs.write(`${root}/kept.ts`, "trunk\n");
		await run("commit", "-qam", "trunk");
		await run("checkout", "-q", "feature");

		const changes = await git.changes("main");

		expect(changes.since).toEqual("main");
		expect(changes.files.map((file) => file.path)).toEqual(["new.ts"]);
	});

	it("keeps only the files at or under the paths it is given, new ones included", async () => {
		await fs.mkdir(`${root}/src/deep`);
		await fs.mkdir(`${root}/srcs`);
		await fs.write(`${root}/kept.ts`, "two\n");
		await fs.write(`${root}/src/deep/new.ts`, "fresh\n");
		await fs.write(`${root}/srcs/other.ts`, "other\n");

		const changes = await git.changes("HEAD", ["src"]);

		expect(changes.files.map((file) => file.path)).toEqual(["src/deep/new.ts"]);
	});

	it("lists every file at or under the paths, tracked or new, and none git ignores or that was deleted", async () => {
		await fs.mkdir(`${root}/src/deep`);
		await fs.mkdir(`${root}/srcs`);
		await fs.write(`${root}/src/a.ts`, "a\n");
		await fs.write(`${root}/src/.gitignore`, "ignored.ts\n");
		await run("add", ".");
		await run("commit", "-qm", "src");
		await fs.write(`${root}/src/deep/new.ts`, "fresh\n");
		await fs.write(`${root}/src/ignored.ts`, "ignored\n");
		await fs.write(`${root}/srcs/other.ts`, "other\n");
		await rm(`${root}/gone.ts`);

		expect(await git.files(["src", "kept.ts", "gone.ts"])).toEqual([
			"kept.ts",
			"src/.gitignore",
			"src/a.ts",
			"src/deep/new.ts",
		]);
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

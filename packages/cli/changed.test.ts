import { beforeEach, describe, expect, it } from "bun:test";
import { FakePs } from "@webappwiz/sys/testing";
import { changed } from "./changed";

describe("changed", () => {
	let ps: FakePs;

	beforeEach(() => {
		ps = new FakePs();
	});

	it("asks git about the ref and about files git has never seen", async () => {
		ps.setCaptureOutput("", "");

		await changed(ps, "/p", "main");

		expect(ps.getCalls()).toEqual([
			"git -C /p diff --name-only --diff-filter=d --relative main",
			"git -C /p ls-files --others --exclude-standard",
		]);
	});

	it("names files the way a rule's glob does, relative to the directory", async () => {
		ps.setCaptureOutput("src/a.ts\nsrc/b.ts\n", "");

		expect([...(await changed(ps, "/p", "main"))]).toEqual([
			"src/a.ts",
			"src/b.ts",
		]);
	});

	it("counts a file once when it is both changed and untracked", async () => {
		ps.setCaptureOutput("src/a.ts\n", "");

		expect((await changed(ps, "/p", "main")).size).toBe(1);
	});

	it("is empty when git reports nothing", async () => {
		ps.setCaptureOutput("\n", "");

		expect((await changed(ps, "/p", "main")).size).toBe(0);
	});

	it("fails loudly when the ref is not one git knows", async () => {
		ps.exit(128);
		ps.setCaptureOutput("", "fatal: bad revision 'nope'");

		expect(changed(ps, "/p", "nope")).rejects.toThrow(
			"git diff failed in /p: fatal: bad revision 'nope'",
		);
	});
});

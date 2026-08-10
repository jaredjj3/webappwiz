import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { test } from "./test";

describe("test", () => {
	const packages = resolve(import.meta.dir, "..");
	let fs: FakeFs;
	let ps: FakePs;

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		await fs.mkdir(`${packages}/sys`);
		await fs.mkdir(`${packages}/log`);
	});

	it("runs bun test once, from the workspace root", async () => {
		await test({ package: "" }, fs, ps);

		expect(ps.getCalls()).toEqual(["bun test --pass-with-no-tests"]);
	});

	it("filters to the named package", async () => {
		await test({ package: "log" }, fs, ps);

		expect(ps.getCalls()).toEqual([
			"bun test --pass-with-no-tests packages/log/",
		]);
	});

	it("rejects a package that does not exist", async () => {
		await expect(test({ package: "nope" }, fs, ps)).rejects.toThrow(
			"no such package: nope",
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("fails when bun test fails", async () => {
		ps.exit(1); // FakePs returns this exit code from every spawn

		await expect(test({ package: "" }, fs, ps)).rejects.toThrow("Tests failed");
	});
});

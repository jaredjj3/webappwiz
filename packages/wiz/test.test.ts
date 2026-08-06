import { test as bunTest, expect } from "bun:test";
import { resolve } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { test } from "./test";

const packages = resolve(import.meta.dir, "..");

async function packagesDir(...entries: string[]) {
	const fs = new FakeFs();
	await fs.mkdir(packages);
	for (const entry of entries) {
		await (entry.includes(".")
			? fs.write(`${packages}/${entry}`, "")
			: fs.mkdir(`${packages}/${entry}`));
	}
	return fs;
}

bunTest("runs bun test once per package directory, in order", async () => {
	const ps = new FakePs();
	const fs = await packagesDir("sys", "log", "README.md");

	await test({ package: "" }, new MemoryLogger(), fs, ps);

	expect(ps.getCalls()).toEqual([
		"bun test --pass-with-no-tests --concurrent",
		"bun test --pass-with-no-tests --concurrent",
	]);
});

bunTest("runs only the named package when given one", async () => {
	const ps = new FakePs();
	const fs = await packagesDir("sys", "log");

	await test({ package: "log" }, new MemoryLogger(), fs, ps);

	expect(ps.getCalls()).toEqual(["bun test --pass-with-no-tests --concurrent"]);
});

bunTest("rejects a package that does not exist", async () => {
	const fs = await packagesDir("sys");

	await expect(
		test({ package: "nope" }, new MemoryLogger(), fs, new FakePs()),
	).rejects.toThrow("no such package: nope");
});

bunTest("names the packages whose tests failed", async () => {
	const ps = new FakePs();
	ps.exit(1); // FakePs returns this exit code from every spawn
	const fs = await packagesDir("sys");
	const log = new MemoryLogger();

	await expect(test({ package: "" }, log, fs, ps)).rejects.toThrow(
		"Tests failed",
	);
	expect(log.entries.at(-1)?.message).toContain("sys");
});

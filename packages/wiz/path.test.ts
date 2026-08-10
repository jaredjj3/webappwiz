import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { path } from "./path";

describe("path", () => {
	const binDir = resolve(import.meta.dir, "../../bin");
	const profile = "/home/wiz/.zshrc";
	let log: MemoryLogger;
	let fs: FakeFs;
	let ps: FakePs;

	beforeEach(() => {
		log = new MemoryLogger();
		fs = new FakeFs();
		ps = new FakePs();
		ps.setEnv({ HOME: "/home/wiz", SHELL: "/bin/zsh" });
	});

	it("appends a tagged export to the shell profile", async () => {
		await fs.write(profile, "existing\n");

		await path({ add: true, remove: false }, log, fs, ps);

		expect(await fs.read(profile)).toBe(
			`existing\n\nexport PATH="${binDir}:$PATH" # webappwiz\n`,
		);
	});

	it("adding twice is a no-op", async () => {
		await path({ add: true, remove: false }, log, fs, ps);
		const once = await fs.read(profile);
		await path({ add: true, remove: false }, log, fs, ps);

		expect(await fs.read(profile)).toBe(once);
	});

	it("remove deletes only our tagged lines", async () => {
		await fs.write(profile, "keep me");
		await path({ add: true, remove: false }, log, fs, ps);

		await path({ add: false, remove: true }, log, fs, ps);

		expect(await fs.read(profile)).toBe("keep me\n");
	});

	it("rejects both flags and neither flag", async () => {
		await expect(
			path({ add: true, remove: true }, log, fs, ps),
		).rejects.toThrow("one of --add or --remove");
		await expect(
			path({ add: false, remove: false }, log, fs, ps),
		).rejects.toThrow("one of --add or --remove");
	});
});

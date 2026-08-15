import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { path } from "./path";

describe("path", () => {
	const binDir = resolve(import.meta.dirname, "../../bin");
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

	const add = () => path({ add: true, remove: false, log, fs, ps });
	const remove = () => path({ add: false, remove: true, log, fs, ps });

	it("appends a tagged export to the shell profile", async () => {
		await fs.write(profile, "existing\n");

		await add();

		expect(await fs.read(profile)).toBe(
			`existing\n\nexport PATH="${binDir}:$PATH" # webappwiz\n`,
		);
	});

	it("leaves the profile unchanged when adding twice", async () => {
		await add();
		const once = await fs.read(profile);
		await add();

		expect(await fs.read(profile)).toBe(once);
	});

	it("deletes only our tagged lines when removing", async () => {
		await fs.write(profile, "keep me");
		await add();

		await remove();

		expect(await fs.read(profile)).toBe("keep me\n");
	});

	it("rejects both flags and neither flag", async () => {
		await expect(
			path({ add: true, remove: true, log, fs, ps }),
		).rejects.toThrow("one of --add or --remove");
		await expect(
			path({ add: false, remove: false, log, fs, ps }),
		).rejects.toThrow("one of --add or --remove");
	});
});

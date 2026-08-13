import { beforeEach, describe, expect, it } from "bun:test";
import { resolve } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { Path } from "./path";

describe("path", () => {
	const binDir = resolve(import.meta.dirname, "../../bin");
	const profile = "/home/wiz/.zshrc";
	let log: MemoryLogger;
	let fs: FakeFs;
	let ps: FakePs;
	let path: Path;

	beforeEach(() => {
		log = new MemoryLogger();
		fs = new FakeFs();
		ps = new FakePs();
		ps.setEnv({ HOME: "/home/wiz", SHELL: "/bin/zsh" });
		path = new Path(log, fs, ps);
	});

	it("appends a tagged export to the shell profile", async () => {
		await fs.write(profile, "existing\n");

		await path.run({ add: true, remove: false });

		expect(await fs.read(profile)).toBe(
			`existing\n\nexport PATH="${binDir}:$PATH" # webappwiz\n`,
		);
	});

	it("leaves the profile unchanged when adding twice", async () => {
		await path.run({ add: true, remove: false });
		const once = await fs.read(profile);
		await path.run({ add: true, remove: false });

		expect(await fs.read(profile)).toBe(once);
	});

	it("deletes only our tagged lines when removing", async () => {
		await fs.write(profile, "keep me");
		await path.run({ add: true, remove: false });

		await path.run({ add: false, remove: true });

		expect(await fs.read(profile)).toBe("keep me\n");
	});

	it("rejects both flags and neither flag", async () => {
		await expect(path.run({ add: true, remove: true })).rejects.toThrow(
			"one of --add or --remove",
		);
		await expect(path.run({ add: false, remove: false })).rejects.toThrow(
			"one of --add or --remove",
		);
	});
});

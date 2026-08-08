import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";

import { path } from "./path";

const binDir = resolve(import.meta.dir, "../../bin");
const profile = "/home/wiz/.zshrc";

function setup() {
	const ps = new FakePs();
	ps.setEnv({ HOME: "/home/wiz", SHELL: "/bin/zsh" });
	return { log: new MemoryLogger(), fs: new FakeFs(), ps };
}

test("appends a tagged export to the shell profile", async () => {
	const { log, fs, ps } = setup();
	await fs.write(profile, "existing\n");

	await path({ add: true, remove: false }, log, fs, ps);

	expect(await fs.read(profile)).toBe(
		`existing\n\nexport PATH="${binDir}:$PATH" # webappwiz\n`,
	);
});

test("adding twice is a no-op", async () => {
	const { log, fs, ps } = setup();

	await path({ add: true, remove: false }, log, fs, ps);
	const once = await fs.read(profile);
	await path({ add: true, remove: false }, log, fs, ps);

	expect(await fs.read(profile)).toBe(once);
});

test("remove deletes only our tagged lines", async () => {
	const { log, fs, ps } = setup();
	await fs.write(profile, "keep me");
	await path({ add: true, remove: false }, log, fs, ps);

	await path({ add: false, remove: true }, log, fs, ps);

	expect(await fs.read(profile)).toBe("keep me\n");
});

test("rejects both flags and neither flag", async () => {
	const { log, fs, ps } = setup();

	await expect(path({ add: true, remove: true }, log, fs, ps)).rejects.toThrow(
		"one of --add or --remove",
	);
	await expect(
		path({ add: false, remove: false }, log, fs, ps),
	).rejects.toThrow("one of --add or --remove");
});

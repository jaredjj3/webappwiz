import { expect, test } from "bun:test";

import { MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs, FileHostMapper } from "../index";

const HOSTS = "127.0.0.1   localhost\n10.0.0.1   old.test";

function setup(platform: NodeJS.Platform = "darwin") {
	const fs = new FakeFs();
	const ps = new FakePs();
	ps.platform = platform;
	return { fs, ps, mapper: FileHostMapper.default(fs, ps, new MemoryLogger()) };
}

test("appends a missing hostname via a sudo copy of a temp file", async () => {
	const { fs, ps, mapper } = setup();
	await fs.write("/etc/hosts", HOSTS);

	await mapper.map("new.test", "10.0.0.9");

	const [call] = ps.getCalls();
	const tempFile = call?.split(" ")[2] ?? "";
	expect(call).toMatch(/^sudo cp \/tmp\/hosts-\d+ \/etc\/hosts$/);
	expect(await fs.exists(tempFile)).toBe(false);
});

test("rewrites an existing hostname whose IP changed", async () => {
	const { fs, ps, mapper } = setup();
	await fs.write("/etc/hosts", HOSTS);

	// Capture what would have been copied over /etc/hosts by reading the temp file mid-flight.
	let staged = "";
	ps.simulate(async () => {
		staged = await fs.read(`${ps.getCalls().at(-1)?.split(" ")[2]}`);
		return 0;
	});

	await mapper.map("old.test", "10.0.0.2");

	expect(staged).toBe("127.0.0.1   localhost\n10.0.0.2   old.test");
});

test("does nothing when the mapping is already correct", async () => {
	const { fs, ps, mapper } = setup();
	await fs.write("/etc/hosts", HOSTS);

	await mapper.map("old.test", "10.0.0.1");

	expect(ps.getCalls()).toEqual([]);
});

test("writes directly on windows and rejects unknown platforms", async () => {
	const { fs, ps, mapper } = setup("win32");
	await fs.write("C:\\Windows\\System32\\drivers\\etc\\hosts", HOSTS);

	await mapper.map("new.test", "10.0.0.9");

	expect(ps.getCalls()).toEqual([]);
	expect(await fs.read("C:\\Windows\\System32\\drivers\\etc\\hosts")).toContain(
		"10.0.0.9   new.test",
	);

	const other = new FakePs();
	other.platform = "freebsd";
	expect(() =>
		FileHostMapper.default(new FakeFs(), other, new MemoryLogger()),
	).toThrow("Unsupported platform");
});

test("a failed sudo copy is an error", async () => {
	const { fs, ps, mapper } = setup();
	await fs.write("/etc/hosts", HOSTS);
	ps.exit(1);

	expect(mapper.map("new.test", "10.0.0.9")).rejects.toThrow(
		"failed to update /etc/hosts",
	);
});

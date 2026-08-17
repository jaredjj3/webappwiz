import { beforeEach, describe, expect, it } from "bun:test";

import { MemoryLogger } from "webappwiz/log";
import { FileHostMapper } from "../index";
import { FakeFs, FakePs } from "../testing";

describe("FileHostMapper", () => {
	const HOSTS = "127.0.0.1   localhost\n10.0.0.1   old.test";
	let fs: FakeFs;
	let ps: FakePs;
	let mapper: FileHostMapper;

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs(); // darwin; the windows case builds its own below
		mapper = FileHostMapper.default({ fs, ps, log: new MemoryLogger() });
		await fs.write("/etc/hosts", HOSTS);
	});

	it("appends a missing hostname via a sudo copy of a temp file", async () => {
		await mapper.map("new.test", "10.0.0.9");

		const [call] = ps.getCalls();
		const tempFile = call?.split(" ")[2] ?? "";
		expect(call).toMatch(/^sudo cp \/tmp\/hosts-\d+ \/etc\/hosts$/);
		expect(await fs.exists(tempFile)).toBe(false);
	});

	it("rewrites an existing hostname whose IP changed", async () => {
		let staged = "";
		ps.simulate(async () => {
			staged = await fs.read(`${ps.getCalls().at(-1)?.split(" ")[2]}`);
			return 0;
		});

		await mapper.map("old.test", "10.0.0.2");

		expect(staged).toBe("127.0.0.1   localhost\n10.0.0.2   old.test");
	});

	it("does nothing when the mapping is already correct", async () => {
		await mapper.map("old.test", "10.0.0.1");

		expect(ps.getCalls()).toEqual([]);
	});

	it("writes directly on windows and rejects unknown platforms", async () => {
		const windows = new FakePs();
		windows.platform = "win32";
		const windowsMapper = FileHostMapper.default({
			fs,
			ps: windows,
			log: new MemoryLogger(),
		});
		const hostsPath = "C:\\Windows\\System32\\drivers\\etc\\hosts";
		await fs.write(hostsPath, HOSTS);

		await windowsMapper.map("new.test", "10.0.0.9");

		expect(windows.getCalls()).toEqual([]);
		expect(await fs.read(hostsPath)).toContain("10.0.0.9   new.test");

		const other = new FakePs();
		other.platform = "freebsd";
		expect(() =>
			FileHostMapper.default({
				fs: new FakeFs(),
				ps: other,
				log: new MemoryLogger(),
			}),
		).toThrow("Unsupported platform");
	});

	it("rejects when the sudo copy fails", async () => {
		ps.exit(1);

		expect(mapper.map("new.test", "10.0.0.9")).rejects.toThrow(
			"failed to update /etc/hosts",
		);
	});
});

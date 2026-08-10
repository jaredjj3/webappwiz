import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { Duration, sleep } from "@webappwiz/time";
import { NodeFs } from "../fs/node-fs";
import { FakePs } from "../ps/fake-ps";
import { FileLock } from "./file-lock";

/**
 * A real filesystem, because `mkdir`'s atomicity is the whole mechanism and an
 * in-memory Map cannot prove it. Processes are faked so signals and pid
 * liveness can be driven from the test.
 */
describe("FileLock", () => {
	let dir: string;
	let path: string;
	let fs: NodeFs;
	let ps: FakePs;
	let log: MemoryLogger;

	beforeEach(async () => {
		dir = await mkdtemp(join(tmpdir(), "file-lock-"));
		path = join(dir, "some.lock");
		fs = new NodeFs();
		ps = new FakePs();
		log = new MemoryLogger();
	});

	afterEach(async () => {
		await rm(dir, { recursive: true, force: true });
	});

	it("a second acquire blocks until the first releases", async () => {
		const order: string[] = [];
		const first = new FileLock(fs, ps, log, path, { pollMs: 10 });
		const second = new FileLock(fs, ps, log, path, { pollMs: 10 });

		await first.acquire();
		order.push("first-in");

		const waiting = second.acquire().then(async () => {
			order.push("second-in");
			await second.release();
		});

		await sleep(Duration.ms(50));
		expect(order).toEqual(["first-in"]); // still waiting on the mutex

		order.push("first-out");
		await first.release();
		await waiting;

		expect(order).toEqual(["first-in", "first-out", "second-in"]);
		expect(await fs.exists(path)).toBe(false);
	});

	it("a lock held by a dead pid is stolen, loudly", async () => {
		const dead = 999_001;
		await fs.mkdir(path, { recursive: false });
		await fs.write(
			`${path}/holder.json`,
			JSON.stringify({
				pid: dead,
				hostname: ps.hostname,
				at: new Date().toISOString(), // fresh: only the dead pid gives it away
			}),
		);
		ps.kill(dead);

		const lock = new FileLock(fs, ps, log, path, { pollMs: 10 });
		await lock.acquire();

		expect(log.entries.map((e) => String(e.message)).join("\n")).toContain(
			"stealing stale lock",
		);
		const holder = JSON.parse(await fs.read(`${path}/holder.json`));
		expect(holder.pid).toBe(ps.pid);
		await lock.release();
	});

	it("a lock older than the staleness window is stolen even if the pid lives", async () => {
		await fs.mkdir(path, { recursive: false });
		await fs.write(
			`${path}/holder.json`,
			JSON.stringify({
				pid: ps.pid,
				hostname: ps.hostname,
				at: new Date(Date.now() - 10_000).toISOString(),
			}),
		);

		const lock = new FileLock(fs, ps, log, path, {
			stalenessMs: 50,
			pollMs: 10,
		});
		await lock.acquire();

		expect(log.entries.map((e) => String(e.message)).join("\n")).toContain(
			"stealing stale lock",
		);
		await lock.release();
	});

	it("a crash releases the lock — SIGINT removes it and exits", async () => {
		await new FileLock(fs, ps, log, path, { pollMs: 10 }).acquire();
		expect(await fs.exists(path)).toBe(true);

		ps.dispatch("SIGINT");

		expect(await fs.exists(path)).toBe(false);
		expect(ps.getExitCode()).toBe(130);
	});

	it("process exit removes a lock nobody released", async () => {
		await new FileLock(fs, ps, log, path, { pollMs: 10 }).acquire();
		ps.dispatch("exit");

		expect(await fs.exists(path)).toBe(false);
	});

	it("releaseIfOurs leaves a lock held by another process alone", async () => {
		const other = new FileLock(fs, ps, log, path, { pollMs: 10 });
		await other.acquire();
		await fs.write(
			`${path}/holder.json`,
			JSON.stringify({
				pid: 999_002,
				hostname: ps.hostname,
				at: new Date().toISOString(),
			}),
		);

		await new FileLock(fs, ps, log, path, { pollMs: 10 }).releaseIfOurs();

		expect(await fs.exists(path)).toBe(true);
		await other.release();
	});
});

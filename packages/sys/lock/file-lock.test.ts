import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MemoryLogger } from "@webappwiz/log";
import { NodeFs } from "../fs/node-fs";
import { FakePs } from "../ps/fake-ps";
import { FileLock } from "./file-lock";

/**
 * A real filesystem, because `mkdir`'s atomicity is the whole mechanism and an
 * in-memory Map cannot prove it. Processes are faked so signals and pid
 * liveness can be driven from the test.
 */
async function scratch() {
	const dir = await mkdtemp(join(tmpdir(), "file-lock-"));
	const fs = new NodeFs();
	const ps = new FakePs();
	const log = new MemoryLogger();
	const path = join(dir, "some.lock");
	return {
		fs,
		ps,
		log,
		path,
		lock: () => new FileLock(fs, ps, log, path, { pollMs: 10 }),
		out: () => log.entries.map((e) => String(e.message)).join("\n"),
		cleanup: () => rm(dir, { recursive: true, force: true }),
	};
}

test("a second acquire blocks until the first releases", async () => {
	const s = await scratch();
	const order: string[] = [];
	const first = s.lock();
	const second = s.lock();

	await first.acquire();
	order.push("first-in");

	const waiting = second.acquire().then(async () => {
		order.push("second-in");
		await second.release();
	});

	await Bun.sleep(50);
	expect(order).toEqual(["first-in"]); // still waiting on the mutex

	order.push("first-out");
	await first.release();
	await waiting;

	expect(order).toEqual(["first-in", "first-out", "second-in"]);
	expect(await s.fs.exists(s.path)).toBe(false);
	await s.cleanup();
});

test("a lock held by a dead pid is stolen, loudly", async () => {
	const s = await scratch();
	const dead = 999_001;
	await s.fs.mkdir(s.path, { recursive: false });
	await s.fs.write(
		`${s.path}/holder.json`,
		JSON.stringify({
			pid: dead,
			hostname: s.ps.hostname,
			at: new Date().toISOString(), // fresh: only the dead pid gives it away
		}),
	);
	s.ps.kill(dead);

	const lock = s.lock();
	await lock.acquire();

	expect(s.out()).toContain("stealing stale lock");
	const holder = JSON.parse(await s.fs.read(`${s.path}/holder.json`));
	expect(holder.pid).toBe(s.ps.pid);
	await lock.release();
	await s.cleanup();
});

test("a lock older than the staleness window is stolen even if the pid lives", async () => {
	const s = await scratch();
	await s.fs.mkdir(s.path, { recursive: false });
	await s.fs.write(
		`${s.path}/holder.json`,
		JSON.stringify({
			pid: s.ps.pid,
			hostname: s.ps.hostname,
			at: new Date(Date.now() - 10_000).toISOString(),
		}),
	);

	const lock = new FileLock(s.fs, s.ps, s.log, s.path, {
		stalenessMs: 50,
		pollMs: 10,
	});
	await lock.acquire();

	expect(s.out()).toContain("stealing stale lock");
	await lock.release();
	await s.cleanup();
});

test("a crash releases the lock — SIGINT removes it and exits", async () => {
	const s = await scratch();

	await s.lock().acquire();
	expect(await s.fs.exists(s.path)).toBe(true);

	s.ps.dispatch("SIGINT");

	expect(await s.fs.exists(s.path)).toBe(false);
	expect(s.ps.getExitCode()).toBe(130);
	await s.cleanup();
});

test("process exit removes a lock nobody released", async () => {
	const s = await scratch();

	await s.lock().acquire();
	s.ps.dispatch("exit");

	expect(await s.fs.exists(s.path)).toBe(false);
	await s.cleanup();
});

test("releaseIfOurs leaves a lock held by another process alone", async () => {
	const s = await scratch();
	const other = s.lock();
	await other.acquire();
	await s.fs.write(
		`${s.path}/holder.json`,
		JSON.stringify({
			pid: 999_002,
			hostname: s.ps.hostname,
			at: new Date().toISOString(),
		}),
	);

	await s.lock().releaseIfOurs();

	expect(await s.fs.exists(s.path)).toBe(true);
	await other.release();
	await s.cleanup();
});

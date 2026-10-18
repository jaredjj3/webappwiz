import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { open } from "node:fs/promises";
import { join } from "node:path";
import { makeUndumpable } from "./undumpable";

const MODULE = join(import.meta.dir, "undumpable.ts");

describe("makeUndumpable", () => {
	let guarded: Child;
	let open: Child;

	beforeEach(async () => {
		guarded = await startChild(true);
		open = await startChild(false);
	});

	afterEach(() => {
		guarded.process.stdin.end();
		open.process.stdin.end();
	});

	it.skipIf(process.platform !== "linux")(
		"keeps a process of the same user out of its memory on Linux",
		async () => {
			expect(guarded.report).toEqual({
				result: { undumpable: true, how: "prctl(PR_SET_DUMPABLE, 0)" },
				ran: true,
			});
			expect([
				await canOpenMemory(open.process.pid),
				await canOpenMemory(guarded.process.pid),
			]).toEqual([true, false]);
		},
	);

	it.skipIf(process.platform !== "darwin")(
		"denies debuggers on macOS, and the process still runs programs",
		() => {
			expect(guarded.report).toEqual({
				result: { undumpable: true, how: "ptrace(PT_DENY_ATTACH)" },
				ran: true,
			});
		},
	);

	it("says why it does nothing where it cannot", async () => {
		expect(await makeUndumpable({ platform: "win32" })).toEqual({
			undumpable: false,
			why: "win32 has no call that keeps a user's own processes out of each other's memory",
		});
	});
});

interface Child {
	process: Bun.Subprocess<"pipe", "pipe", "inherit">;
	report: { result: unknown; ran: boolean };
}

/**
 * A child that runs `makeUndumpable` when `guard` says to, reports what it
 * returned, and lives until its stdin closes, since the call cannot be undone
 * and must not touch the test runner.
 */
async function startChild(guard: boolean): Promise<Child> {
	const child = Bun.spawn(
		[
			process.execPath,
			"-e",
			`
			const { makeUndumpable } = await import(${JSON.stringify(MODULE)});
			const result = ${guard} ? await makeUndumpable() : null;
			// it still runs programs once guarded
			const ran = Bun.spawnSync([process.execPath, "-e", ""]).exitCode === 0;
			console.log(JSON.stringify({ result, ran }));
			for await (const _ of Bun.stdin.stream()) {}
			`,
		],
		{ stdin: "pipe", stdout: "pipe", stderr: "inherit" },
	);
	const reader = child.stdout.getReader();
	const { value } = await reader.read();
	reader.releaseLock();
	return {
		process: child,
		report: JSON.parse(new TextDecoder().decode(value)),
	};
}

async function canOpenMemory(pid: number): Promise<boolean> {
	try {
		await (await open(`/proc/${pid}/mem`, "r")).close();
		return true;
	} catch {
		return false;
	}
}

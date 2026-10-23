import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { decode, exitOf, reap } from "./reap";

describe("reap", () => {
	it("reads an exit code out of a wait status", () => {
		expect(decode(0)).toBe(0);
		expect(decode(3 << 8)).toBe(3);
	});

	it("reads a signal death as 128 plus the signal", () => {
		expect(decode(9)).toBe(137);
	});

	it("does not reap a child the runtime has already reported", async () => {
		const child = {
			pid: 123,
			exitCode: null,
			signalCode: "SIGTERM" as const,
			exited: new Promise<number>(() => {}),
		};
		const kernel = {
			reap: () => {
				throw new Error("must not reap a reused pid");
			},
		};
		expect(await exitOf(child, kernel)).toBe(143);
	});

	it("accepts a prompt runtime exit without asking the kernel", async () => {
		const child = {
			pid: 123,
			exitCode: 4,
			signalCode: null,
			exited: Promise.resolve(4),
		};
		const kernel = {
			reap: () => {
				throw new Error("must not reap a reported child");
			},
		};
		expect(await exitOf(child, kernel)).toBe(4);
	});

	it.if(reap !== null)("leaves a child that is still running alone", () => {
		const child = spawn("sleep", ["5"]);
		try {
			expect(reap?.(child.pid ?? 0)).toBeNull();
		} finally {
			child.kill();
		}
	});
});

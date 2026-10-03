import { describe, expect, it } from "bun:test";
import { spawn } from "node:child_process";
import { decode, reap } from "./reap";

describe("reap", () => {
	it("reads an exit code out of a wait status", () => {
		expect(decode(0)).toBe(0);
		expect(decode(3 << 8)).toBe(3);
	});

	it("reads a signal death as 128 plus the signal", () => {
		expect(decode(9)).toBe(137);
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

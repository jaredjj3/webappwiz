import { beforeEach, describe, expect, it } from "bun:test";
import { FakeProcess } from "../testing";
import { NodePs } from "./node-ps";

describe("NodePs", () => {
	/** Echoes the variables a spawned command can actually see. */
	const SHOW = ["sh", "-c", 'printf \'%s|%s\' "$INHERITED" "$ADDED"'];
	let proc: FakeProcess;

	beforeEach(() => {
		proc = new FakeProcess();
	});

	it("adds to the environment rather than replacing it when given env", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("prefers the caller's value over the inherited one", async () => {
		proc.env = { INHERITED: "kept", ADDED: "old" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("inherits the whole environment when no env is passed", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW);

		expect(stdout).toBe("kept|");
	});

	it("reports 128 plus the signal when a command is killed", async () => {
		proc.env = {};

		const { exitCode } = await new NodePs(proc).spawnCapture([
			"sh",
			"-c",
			"kill -9 $$",
		]);

		expect(exitCode).toBe(137); // 128 + SIGKILL, the way a shell reports it
	});
});

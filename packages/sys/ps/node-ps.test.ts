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

	it("env adds to the environment rather than replacing it", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("a caller's value wins over the one it inherits", async () => {
		proc.env = { INHERITED: "kept", ADDED: "old" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("passing no env inherits the whole environment", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs(proc).spawnCapture(SHOW);

		expect(stdout).toBe("kept|");
	});

	it("a command killed by a signal does not report success", async () => {
		proc.env = {};

		const { exitCode } = await new NodePs(proc).spawnCapture([
			"sh",
			"-c",
			"kill -9 $$",
		]);

		expect(exitCode).toBe(137); // 128 + SIGKILL, the way a shell reports it
	});
});

import { expect, test } from "bun:test";
import { FakeProcess } from "../testing";
import { NodePs } from "./node-ps";

function ps(env: NodeJS.ProcessEnv): NodePs {
	const proc = new FakeProcess();
	proc.env = env;
	return new NodePs(proc);
}

/** Echoes the variables a spawned command can actually see. */
const SHOW = ["sh", "-c", 'printf \'%s|%s\' "$INHERITED" "$ADDED"'];

test("env adds to the environment rather than replacing it", async () => {
	const { stdout } = await ps({ INHERITED: "kept" }).spawnCapture(SHOW, {
		env: { ADDED: "new" },
	});

	expect(stdout).toBe("kept|new");
});

test("a caller's value wins over the one it inherits", async () => {
	const { stdout } = await ps({
		INHERITED: "kept",
		ADDED: "old",
	}).spawnCapture(SHOW, { env: { ADDED: "new" } });

	expect(stdout).toBe("kept|new");
});

test("passing no env inherits the whole environment", async () => {
	const { stdout } = await ps({ INHERITED: "kept" }).spawnCapture(SHOW);

	expect(stdout).toBe("kept|");
});

test("a command killed by a signal does not report success", async () => {
	const { exitCode } = await ps({}).spawnCapture(["sh", "-c", "kill -9 $$"]);

	expect(exitCode).toBe(137); // 128 + SIGKILL, the way a shell reports it
});

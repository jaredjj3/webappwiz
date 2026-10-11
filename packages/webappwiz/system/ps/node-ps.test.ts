import { beforeEach, describe, expect, it } from "bun:test";
import { FakeProcess } from "../testing";
import { NodePs } from "./node-ps";
import { reap } from "./reap";

describe("NodePs", () => {
	const SHOW = ["sh", "-c", 'printf \'%s|%s\' "$INHERITED" "$ADDED"'];
	let proc: FakeProcess;

	beforeEach(() => {
		proc = new FakeProcess();
	});

	it("drops the runtime and the entry point from args", () => {
		proc.argv = ["/bin/bun", "/repo/cli.ts", "judge", "--dir", "packages"];

		expect(new NodePs({ proc: proc }).args).toEqual([
			"judge",
			"--dir",
			"packages",
		]);
	});

	it("reports no args when only the runtime and entry point were given", () => {
		proc.argv = ["/bin/bun", "/repo/cli.ts"];

		expect(new NodePs({ proc: proc }).args).toEqual([]);
	});

	it("adds to the environment rather than replacing it when given env", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs({ proc: proc }).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("prefers the caller's value over the inherited one", async () => {
		proc.env = { INHERITED: "kept", ADDED: "old" };

		const { stdout } = await new NodePs({ proc: proc }).spawnCapture(SHOW, {
			env: { ADDED: "new" },
		});

		expect(stdout).toBe("kept|new");
	});

	it("takes unset names out of what the child inherits, unless env gives them", async () => {
		proc.env = { INHERITED: "kept", ADDED: "old" };
		const ps = new NodePs({ proc: proc });

		const dropped = await ps.spawnCapture(SHOW, { unset: ["INHERITED"] });
		const given = await ps.spawnCapture(SHOW, {
			unset: ["ADDED"],
			env: { ADDED: "new" },
		});

		expect(dropped.stdout).toBe("|old");
		expect(given.stdout).toBe("kept|new");
	});

	it("inherits the whole environment when no env is passed", async () => {
		proc.env = { INHERITED: "kept" };

		const { stdout } = await new NodePs({ proc: proc }).spawnCapture(SHOW);

		expect(stdout).toBe("kept|");
	});

	it("reports 128 plus the signal when a command is killed", async () => {
		proc.env = {};

		const { exitCode } = await new NodePs({ proc: proc }).spawnCapture([
			"sh",
			"-c",
			"kill -9 $$",
		]);

		expect(exitCode).toBe(137); // 128 + SIGKILL, the way a shell reports it
	});

	it.if(reap !== null)(
		"reports the exit it reaped itself while the runtime was busy",
		async () => {
			const ps = new NodePs({ proc: proc });
			// The runtime sees a process's first child exit however busy it is.
			await ps.spawnCapture(["true"]);

			const spawned = ps.spawnCapture(["true"]);
			busy(700);

			expect((await spawned).exitCode).toBe(0);
		},
	);

	it("writes stdin to the child and closes it", async () => {
		const { stdout } = await new NodePs({ proc: proc }).spawnCapture(["cat"], {
			stdin: "fed through",
		});

		expect(stdout).toBe("fed through");
	});

	it("kills a child that outlives its timeout", async () => {
		const { exitCode } = await new NodePs({ proc: proc }).spawnCapture(
			["sleep", "5"],
			{ timeoutMs: 50 },
		);

		expect(exitCode).toBe(128 + 15);
	});

	it("kills a child when its signal aborts, and rejects", async () => {
		const abort = new AbortController();
		const spawned = new NodePs({ proc: proc }).spawnCapture(["sleep", "5"], {
			signal: abort.signal,
		});

		abort.abort();

		await expect(spawned).rejects.toThrow();
	});

	it("shows a watcher the output as it arrives", async () => {
		const seen = { stdout: "", stderr: "" };

		await new NodePs({ proc: proc }).spawnCapture(
			["sh", "-c", "echo out; echo err >&2"],
			{
				watcher: {
					stdout: (chunk) => {
						seen.stdout += chunk;
					},
					stderr: (chunk) => {
						seen.stderr += chunk;
					},
				},
			},
		);

		expect(seen).toEqual({ stdout: "out\n", stderr: "err\n" });
	});

	it("starts a child with its stdio open, to speak to while it runs", async () => {
		const child = new NodePs().start([
			"sh",
			"-c",
			'read line; echo "got $line"; echo oops >&2; cat',
		]);
		const writer = child.stdin.getWriter();
		await writer.write(new TextEncoder().encode("hi\n"));

		const reader = child.stdout.getReader();
		const { value } = await reader.read();
		expect(new TextDecoder().decode(value)).toBe("got hi\n");

		await writer.close();
		expect(await child.exited).toBe(0);
		expect(await new Response(child.stderr).text()).toBe("oops\n");
	});

	it("kills a started child, which exits as a shell would report it", async () => {
		const child = new NodePs().start(["sleep", "30"]);

		child.kill();

		expect(await child.exited).toBe(143);
		child.kill();
	});

	it.skipIf(process.platform === "win32")(
		"starts a child on a terminal it controls",
		async () => {
			const child = new NodePs().startOnTerminal(["/bin/sh"], {
				cols: 80,
				rows: 24,
				env: { PS1: "$ " },
			});
			let screen = "";
			const read = (async () => {
				const decoder = new TextDecoder();
				for await (const bytes of child.output) {
					screen += decoder.decode(bytes, { stream: true });
				}
			})();
			const shows = async (text: string) => {
				for (let i = 0; i < 300 && !screen.includes(text); i++) {
					await Bun.sleep(10);
				}
				expect(screen).toContain(text);
			};

			child.resize(120, 40);
			child.write("stty size\n");
			await shows("40 120");

			child.kill("SIGHUP");
			expect(await child.exited).toBe(129);
			child.close();
			await read;
			child.write("ignored\n");
		},
	);
});

/** Holds the event loop for `ms`, longer than a reap poll, so the poll takes the exit before the runtime does. */
function busy(ms: number): void {
	const until = Date.now() + ms;
	while (Date.now() < until) {}
}

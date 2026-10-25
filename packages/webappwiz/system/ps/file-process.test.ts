import { afterEach, describe, expect, it } from "bun:test";
import { readdirSync } from "node:fs";
import { constants, tmpdir } from "node:os";
import {
	type FileProcess,
	type FileRuntime,
	fileCapture,
	fileStart,
} from "./file-process";
import type { Child } from "./ps";
import { reap } from "./reap";

const stdout = "out🙂".repeat(40_000);
const stderr = "err\n".repeat(40_000);
/** Writes the output above, more than a FIFO holds, and exits 7. */
const writes = [
	"bun",
	"-e",
	`process.stdout.write(${JSON.stringify(stdout)});
	process.stderr.write(${JSON.stringify(stderr)});
	process.exitCode = 7;`,
];

describe.if(reap !== null)("FIFO-backed processes", () => {
	const left = (): string[] =>
		readdirSync(tmpdir()).filter((name) => name.startsWith("webappwiz-ps-"));
	const before = left();
	let runtime = new LostExit();
	const start = (argv: string[]): Child =>
		fileStart(argv, { env: process.env, runtime });
	afterEach(() => {
		runtime.expectClean();
		expect(left()).toEqual(before);
		runtime = new LostExit();
	});

	it("recovers a lost capture exit and delivers all its output", async () => {
		const seen = { stdout: "", stderr: "" };
		const result = await fileCapture(writes, {
			env: process.env,
			runtime,
			watcher: {
				stdout: (chunk) => {
					seen.stdout += chunk;
				},
				stderr: (chunk) => {
					seen.stderr += chunk;
				},
			},
		});

		expect(result).toEqual({ exitCode: 7, stdout, stderr });
		expect(seen).toEqual({ stdout, stderr });
		expect(runtime.polls).toBeGreaterThan(0);
	});

	it("stalls a child its reader has stopped reading, and loses nothing", async () => {
		const child = start(["sh", "-c", "head -c 20000000 /dev/zero; exit 3"]);
		const reader = child.stdout.getReader();
		const first = (await reader.read()).value?.length ?? 0;
		expect(first).toBeGreaterThan(0);

		await Bun.sleep(300);
		expect(runtime.exited).toBe(false);

		reader.releaseLock();
		const rest = Buffer.concat(await Array.fromAsync(child.stdout));
		expect(first + rest.length).toBe(20_000_000);
		expect(await child.exited).toBe(3);
	});

	it("keeps what a child wrote before it exited, for a reader who comes later", async () => {
		const child = start(["sh", "-c", "printf done; printf why >&2"]);

		expect(await child.exited).toBe(0);
		await child.stdin.close();
		child.kill();
		expect(runtime.killed).toBe(false);
		expect(await new Response(child.stdout).text()).toBe("done");
		expect(await new Response(child.stderr).text()).toBe("why");
	});

	it("lets a reader cancel without stalling the child", async () => {
		const child = start(["head", "-c", "20000000", "/dev/zero"]);
		const reader = child.stdout.getReader();
		expect((await reader.read()).value?.length).toBeGreaterThan(0);
		await reader.cancel();
		// It dies writing to a stdout nobody reads, as on a closed pipe.
		expect(await child.exited).toBe(128 + 13);
	});

	it("settles capture even when the lost exit strands stdin writes", async () => {
		runtime.input = {
			write: () => 1,
			flush: () => new Promise<number>(() => {}),
			end: () => new Promise<number>(() => {}),
		};
		const result = await fileCapture(writes, {
			env: process.env,
			runtime,
			input: "data",
		});
		expect(result).toEqual({ exitCode: 7, stdout, stderr });
	});

	it.each([
		["program", ["/no/such/webappwiz-program"], undefined],
		["directory", ["true"], "/no/such/webappwiz-directory"],
	])(
		"ends a missing %s as streams that error and an exit that rejects",
		async (_, argv, cwd) => {
			const child = fileStart(argv, { env: process.env, cwd });

			expect(child.pid).toBeNull();
			await expect(child.exited).rejects.toThrow("ENOENT");
			await expect(new Response(child.stdout).text()).rejects.toThrow();
			await expect(new Response(child.stderr).text()).rejects.toThrow();
			const writer = child.stdin.getWriter();
			await writer.write(new Uint8Array([1]));
			await writer.close();
			child.kill();
		},
	);
});

/** A real child whose exit Bun never delivers: only the kernel's reap finds it. */
class LostExit implements FileRuntime {
	polls = 0;
	killed = false;
	exited = false;
	input: FileProcess["stdin"] = undefined;
	private unreferenced: boolean | undefined;
	private readonly children = new Map<number, Bun.Subprocess>();

	spawn(
		argv: string[],
		opts: Parameters<FileRuntime["spawn"]>[1],
	): FileProcess {
		this.unreferenced = false;
		const child = Bun.spawn(argv, opts);
		this.children.set(child.pid, child);
		void child.exited.then(() => {
			this.exited = true;
		});
		return {
			pid: child.pid,
			exitCode: null,
			signalCode: null,
			exited: new Promise(() => {}),
			stdin: this.input ?? child.stdin,
			kill: (signal) => {
				this.killed = true;
				child.kill(signal);
			},
			unref: () => {
				this.unreferenced = true;
			},
		};
	}

	reap(pid: number): number | null {
		this.polls += 1;
		const child = this.children.get(pid);
		if (child?.exitCode == null && child?.signalCode == null) {
			return null;
		}
		// Bun took the real status, so make the wait status it would have been.
		return child.signalCode
			? (constants.signals[child.signalCode] ?? 0)
			: (child.exitCode ?? 0) << 8;
	}

	expectClean(): void {
		expect(this.unreferenced ?? true).toBe(true);
	}
}

import { beforeEach, describe, expect, it } from "bun:test";
import { existsSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	type FileProcess,
	type FileRuntime,
	fileCapture,
	fileStart,
} from "./file-process";

describe("file-backed processes", () => {
	let runtime: LostExit;
	beforeEach(() => {
		runtime = new LostExit();
	});
	it("recovers a lost capture exit, drains all output, and removes its files", async () => {
		const seen = { stdout: "", stderr: "" };
		const result = await fileCapture(["fake"], {
			env: {},
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

		expect(result).toEqual({
			exitCode: 7,
			stdout: runtime.stdout,
			stderr: runtime.stderr,
		});
		expect(seen).toEqual({ stdout: runtime.stdout, stderr: runtime.stderr });
		expect(runtime.polls).toBe(1);
		runtime.expectClean();
	});

	it("closes both streams before a lost start exit resolves, even without readers", async () => {
		runtime.status = 9;
		const child = fileStart(["fake"], { env: {}, runtime });
		expect(runtime.polls).toBe(0);
		expect(await child.exited).toBe(137);
		runtime.expectClean();
		await child.stdin.close();
		child.kill();
		expect(runtime.killed).toBe(false);
		expect(await new Response(child.stdout).text()).toBe(runtime.stdout);
		expect(await new Response(child.stderr).text()).toBe(runtime.stderr);
	});

	it("streams before exit and lets a reader cancel without breaking completion", async () => {
		const child = fileStart(["fake"], { env: {}, runtime });
		const reader = child.stdout.getReader();
		expect((await reader.read()).value?.length).toBeGreaterThan(0);
		expect(runtime.polls).toBe(0);
		await reader.cancel();
		expect(await child.exited).toBe(7);
		runtime.expectClean();
	});

	it("settles capture even when the lost exit strands stdin writes", async () => {
		runtime.input = {
			write: () => 1,
			flush: () => new Promise<number>(() => {}),
			end: () => new Promise<number>(() => {}),
		};
		const result = await fileCapture(["fake"], {
			env: {},
			runtime,
			input: "data",
		});
		expect(result).toEqual({
			exitCode: 7,
			stdout: runtime.stdout,
			stderr: runtime.stderr,
		});
		runtime.expectClean();
	});

	it("removes its files when spawning throws", () => {
		const spawn = runtime.spawn.bind(runtime);
		runtime.spawn = (argv, opts) => {
			spawn(argv, opts);
			throw new Error("no program");
		};
		expect(() => fileStart(["fake"], { env: {}, runtime })).toThrow(
			"no program",
		);
		expect(runtime.paths.map((path) => existsSync(dirname(path)))).toEqual([
			false,
			false,
		]);
	});
});

/** A child that wrote everything and died, but Bun never delivered its exit. */
class LostExit implements FileRuntime {
	paths: string[] = [];
	polls = 0;
	unreferenced = false;
	killed = false;
	stdout = "out🙂".repeat(40_000);
	stderr = "err\n".repeat(40_000);
	status = 7 << 8;
	input: FileProcess["stdin"] = undefined;

	spawn(
		_argv: string[],
		opts: Parameters<FileRuntime["spawn"]>[1],
	): FileProcess {
		this.paths = [String(opts.stdout.name), String(opts.stderr.name)];
		writeFileSync(this.paths[0] ?? "", this.stdout);
		writeFileSync(this.paths[1] ?? "", this.stderr);
		return {
			pid: 123,
			exitCode: null,
			signalCode: null,
			exited: new Promise(() => {}),
			stdin: this.input,
			kill: () => {
				this.killed = true;
			},
			unref: () => {
				this.unreferenced = true;
			},
		};
	}

	reap(pid: number): number | null {
		expect(pid).toBe(123);
		this.polls += 1;
		return this.status;
	}

	expectClean(): void {
		expect(this.unreferenced).toBe(true);
		expect(this.paths.map((path) => existsSync(path))).toEqual([false, false]);
		expect(this.paths.map((path) => existsSync(dirname(path)))).toEqual([
			false,
			false,
		]);
	}
}

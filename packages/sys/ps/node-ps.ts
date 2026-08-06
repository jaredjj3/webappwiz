import { type ChildProcess, spawn } from "node:child_process";
import { hostname } from "node:os";
import type { Ps, SpawnCaptureResult, SpawnOptions, SpawnResult } from "./ps";

/**
 * The parts of `process` that NodePs touches. Injecting it is what lets a test
 * keep real spawning — real subprocesses, real exit codes — without a real
 * `process.exit` killing the runner or signal handlers leaking between tests.
 */
export interface ProcessLike {
	platform: NodeJS.Platform;
	pid: number;
	env: NodeJS.ProcessEnv;
	kill(pid: number, signal: 0): boolean;
	chdir(path: string): void;
	exit(code: number): void;
	on(event: string, handler: (...args: unknown[]) => void): void;
	once(event: string, handler: () => void): void;
}

export class NodePs implements Ps {
	platform: NodeJS.Platform;
	pid: number;
	hostname = hostname();

	constructor(private readonly proc: ProcessLike = process) {
		this.platform = proc.platform;
		this.pid = proc.pid;
	}

	alive(pid: number): boolean {
		try {
			this.proc.kill(pid, 0); // signal 0 checks for existence without delivering
			return true;
		} catch (e) {
			// EPERM means it exists but belongs to another user.
			return (e as NodeJS.ErrnoException).code === "EPERM";
		}
	}

	async spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult> {
		const [cmd, args] = parse(argv);
		const child = spawn(cmd, args, {
			...this.options(opts),
			stdio: "inherit",
		});
		return { exitCode: await exitCode(child) };
	}

	async spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult> {
		const [cmd, args] = parse(argv);
		const child = spawn(cmd, args, {
			...this.options(opts),
			stdio: ["inherit", "pipe", "pipe"],
		});

		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (c: string) => {
			stdout += c;
		});
		child.stderr.setEncoding("utf8").on("data", (c: string) => {
			stderr += c;
		});

		return { exitCode: await exitCode(child), stdout, stderr };
	}

	/**
	 * Node replaces the whole environment when `env` is given, so a command
	 * launched with the caller's two or three variables would have no PATH and
	 * no HOME. Callers mean "and these as well", so that is what this does.
	 *
	 * Always built from `proc.env` rather than left undefined for Node to
	 * inherit, so what a child sees comes through the seam either way.
	 */
	private options(opts?: SpawnOptions): {
		cwd?: string;
		env: NodeJS.ProcessEnv;
	} {
		return { cwd: opts?.cwd, env: { ...this.proc.env, ...opts?.env } };
	}

	cd(path: string): void {
		this.proc.chdir(path);
	}

	exit(code: number): void {
		this.proc.exit(code);
	}

	on(signal: string, handler: () => void): void {
		this.proc.on(signal, handler);
	}

	once(event: "exit", handler: () => void): void {
		this.proc.once(event, handler);
	}
}

function parse(argv: string[]): [string, string[]] {
	const [cmd, ...args] = argv;
	if (!cmd) {
		throw new Error("spawn requires a command");
	}
	return [cmd, args];
}

function exitCode(child: ChildProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		// close, not exit: also waits for piped stdio to drain.
		child.on("close", (code) => resolve(code ?? 0));
		child.on("error", reject);
	});
}

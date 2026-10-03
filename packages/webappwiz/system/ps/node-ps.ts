import { type ChildProcess, spawn } from "node:child_process";
import { constants, hostname } from "node:os";
import type { ProcessLike } from "../process-like/process-like";
import type { Ps, SpawnCaptureResult, SpawnOptions, SpawnResult } from "./ps";
import { decode, reap } from "./reap";

/** What a `NodePs` speaks to; the running process by default. */
export interface NodePsOptions {
	proc?: ProcessLike;
}

export class NodePs implements Ps {
	platform: NodeJS.Platform;
	pid: number;
	hostname = hostname();
	args: string[];
	private readonly proc: ProcessLike;

	constructor(opts: NodePsOptions = {}) {
		this.proc = opts.proc ?? process;
		this.platform = this.proc.platform;
		this.pid = this.proc.pid;
		// argv[0] is the runtime and argv[1] the entry point; a cli parses neither
		this.args = this.proc.argv.slice(2);
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
			stdio: [opts?.stdin === undefined ? "inherit" : "pipe", "pipe", "pipe"],
		});
		// a child that exits without reading all of it is not an error here
		child.stdin?.on("error", () => {});
		child.stdin?.end(opts?.stdin);

		// piped above, so both are there; the stdin choice widens the type
		if (child.stdout === null || child.stderr === null) {
			throw new Error("spawnCapture lost its output pipes");
		}
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
			stdout += chunk;
			opts?.watcher?.stdout(chunk);
		});
		child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
			stderr += chunk;
			opts?.watcher?.stderr(chunk);
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
		timeout?: number;
		signal?: AbortSignal;
	} {
		return {
			cwd: opts?.cwd,
			env: { ...this.proc.env, ...opts?.env },
			timeout: opts?.timeoutMs,
			signal: opts?.signal,
		};
	}

	cwd(): string {
		return this.proc.cwd();
	}

	env(name: string): string | undefined {
		return this.proc.env[name];
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

/** How often to check on a child the runtime may have lost track of. */
const REAP_POLL_MS = 500;
/**
 * How long output may take to drain once the child is gone. The runtime can
 * lose the end of a pipe as well as the exit, and output still unread by then
 * is not coming.
 */
const DRAIN_MS = 2_000;

function exitCode(child: ChildProcess): Promise<number> {
	return new Promise((resolve, reject) => {
		let exited: number | null = null;
		let drained: ReturnType<typeof setTimeout> | undefined;
		const stop = (): void => {
			clearInterval(watch);
			clearTimeout(drained);
		};
		const exit = (code: number): void => {
			if (exited === null) {
				exited = code;
				drained = setTimeout(() => {
					stop();
					resolve(code);
				}, DRAIN_MS);
			}
		};
		// Only while the runtime has not seen the exit itself: once it has, the
		// pid is free for the kernel to hand to the next child.
		const watch = setInterval(() => {
			if (!reap || !child.pid || exited !== null || child.exitCode !== null) {
				return;
			}
			const status = reap(child.pid);
			if (status !== null) {
				exit(decode(status));
			}
		}, REAP_POLL_MS);
		child.on("exit", (code, signal) => exit(shellCode(code, signal)));
		// close, not exit: also waits for piped stdio to drain.
		child.on("close", (code, signal) => {
			stop();
			resolve(exited ?? shellCode(code, signal));
		});
		child.on("error", (error) => {
			stop();
			reject(error);
		});
	});
}

/**
 * A child killed by a signal has no exit code, and reading that as 0 would let
 * an OOM-killed test command pass for a green test run. 128 + signal is what a
 * shell reports for the same death.
 */
function shellCode(code: number | null, signal: NodeJS.Signals | null): number {
	return code ?? (signal ? 128 + (constants.signals[signal] ?? 0) : 0);
}

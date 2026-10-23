import {
	closeSync,
	fstatSync,
	mkdtempSync,
	openSync,
	readSync,
	rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Child, OutputWatcher, SpawnCaptureResult } from "./ps";
import { exitOf, reap } from "./reap";

interface FileOptions {
	cwd?: string;
	env: NodeJS.ProcessEnv;
	timeout?: number;
	signal?: AbortSignal;
}

/** Only the Bun process operations the file-backed path needs. */
export interface FileProcess {
	pid: number;
	exitCode: number | null;
	signalCode: NodeJS.Signals | null;
	exited: Promise<number>;
	stdin: Pick<Bun.FileSink, "write" | "flush" | "end"> | number | undefined;
	kill(signal?: NodeJS.Signals): void;
	unref(): void;
}

/** The runtime boundary, also used to reproduce a lost exit without a race. */
export interface FileRuntime {
	spawn(
		argv: string[],
		opts: FileOptions & {
			stdin: "pipe" | "inherit";
			stdout: Bun.BunFile;
			stderr: Bun.BunFile;
		},
	): FileProcess;
	reap(pid: number): number | null;
}

const runtime: FileRuntime = {
	spawn: (argv, opts) => Bun.spawn(argv, opts),
	reap: (pid) => reap?.(pid) ?? null,
};

/** Starts a child with live output streams that survive a lost Bun exit. */
export function fileStart(
	argv: string[],
	opts: FileOptions & { stdin?: "pipe" | "inherit"; runtime?: FileRuntime },
): Child {
	// Bun can lose both an exit and its pipe events. Files remain whole even
	// then: tail them while running, then drain them before reporting exit.
	const { stdin = "pipe", runtime: rt = runtime, ...spawnOptions } = opts;
	opts.signal?.throwIfAborted();
	const dir = mkdtempSync(join(tmpdir(), "webappwiz-ps-"));
	let out: FileOutput | undefined;
	let err: FileOutput | undefined;
	try {
		out = new FileOutput(join(dir, "stdout"));
		err = new FileOutput(join(dir, "stderr"));
		const child = rt.spawn(argv, {
			...spawnOptions,
			stdin,
			stdout: Bun.file(out.path),
			stderr: Bun.file(err.path),
		});
		return follow(child, out, err, dir, opts.signal, rt);
	} catch (error) {
		out?.[Symbol.dispose]();
		err?.[Symbol.dispose]();
		rmSync(dir, { recursive: true, force: true });
		throw error;
	}
}

function follow(
	child: FileProcess,
	out: FileOutput,
	err: FileOutput,
	dir: string,
	signal: AbortSignal | undefined,
	rt: FileRuntime,
): Child {
	let gone = false;
	let readError: unknown;
	const poll = setInterval(() => {
		try {
			out.drain(false);
			err.drain(false);
		} catch (error) {
			readError = error;
			clearInterval(poll);
			child.kill();
		}
	}, 20);
	const exited = (async () => {
		try {
			const code = await exitOf(child, rt);
			gone = true;
			clearInterval(poll);
			if (readError !== undefined) {
				throw readError;
			}
			out.finish();
			err.finish();
			// Bun kills on abort but resolves `exited`; Ps promises rejection.
			signal?.throwIfAborted();
			return code;
		} catch (error) {
			out.fail(error);
			err.fail(error);
			throw error;
		} finally {
			gone = true;
			clearInterval(poll);
			// A lost exit leaves Bun's handle referenced even after waitpid.
			child.unref();
			out[Symbol.dispose]();
			err[Symbol.dispose]();
			rmSync(dir, { recursive: true, force: true });
		}
	})();
	const input = child.stdin;
	const stopped = exited.then(() => undefined);
	// A lost exit may strand a pending stdin flush as well as output pipes.
	// The caller must be free to finish once our own exit is known.
	const closeInput = async (): Promise<void> => {
		if (typeof input === "object") {
			try {
				await Promise.race([input.end(), stopped]);
			} catch (error) {
				ignoreClosedInput(error);
			}
		}
	};
	// Nobody need write stdin: do not leave an unobserved rejection on abort.
	void stopped.catch(() => {});
	return {
		pid: child.pid,
		stdin: new WritableStream<Uint8Array>({
			async write(bytes) {
				if (gone || typeof input !== "object") {
					return;
				}
				try {
					input.write(bytes);
					await Promise.race([input.flush(), stopped]);
				} catch (error) {
					ignoreClosedInput(error);
				}
			},
			close: closeInput,
			abort: closeInput,
		}),
		stdout: out.stream,
		stderr: err.stream,
		exited,
		kill: (signal = "SIGTERM") => {
			if (!gone && child.exitCode === null && child.signalCode === null) {
				child.kill(signal);
			}
		},
	};
}

/** Capture waits for both readers, including their final decoder flush. */
export async function fileCapture(
	argv: string[],
	opts: FileOptions & {
		input?: string;
		watcher?: OutputWatcher;
		runtime?: FileRuntime;
	},
): Promise<SpawnCaptureResult> {
	const { input, watcher, ...startOptions } = opts;
	const child = fileStart(argv, {
		...startOptions,
		stdin: input === undefined ? "inherit" : "pipe",
	});
	const feed = async (): Promise<void> => {
		if (input !== undefined) {
			const writer = child.stdin.getWriter();
			try {
				await writer.write(new TextEncoder().encode(input));
				await writer.close();
			} finally {
				writer.releaseLock();
			}
		}
	};
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		text(child.stdout, { watcher, channel: "stdout" }),
		text(child.stderr, { watcher, channel: "stderr" }),
		feed(),
	]);
	return { exitCode, stdout, stderr };
}

async function text(
	stream: ReadableStream<Uint8Array>,
	opts: TextOptions,
): Promise<string> {
	const decoder = new TextDecoder();
	let result = "";
	for await (const bytes of stream) {
		const chunk = decoder.decode(bytes, { stream: true });
		result += chunk;
		opts.watcher?.[opts.channel](chunk);
	}
	const tail = decoder.decode();
	if (tail !== "") {
		result += tail;
		opts.watcher?.[opts.channel](tail);
	}
	return result;
}

interface TextOptions {
	watcher?: OutputWatcher;
	channel: "stdout" | "stderr";
}

/** Closing input after a child exits is normal, not a failed command. */
export function ignoreClosedInput(error: unknown): void {
	const code = (error as NodeJS.ErrnoException).code;
	if (
		code !== "EPIPE" &&
		code !== "ERR_STREAM_DESTROYED" &&
		code !== "ERR_STREAM_PREMATURE_CLOSE"
	) {
		throw error;
	}
}

class FileOutput implements Disposable {
	readonly stream: ReadableStream<Uint8Array>;
	private readonly fd: number;
	private controller!: ReadableStreamDefaultController<Uint8Array>;
	private offset = 0;
	private closed = false;
	private disposed = false;

	constructor(readonly path: string) {
		this.fd = openSync(path, "wx+", 0o600);
		this.stream = new ReadableStream<Uint8Array>({
			start: (controller) => {
				this.controller = controller;
			},
			cancel: () => {
				this.closed = true;
			},
		});
	}

	drain(final: boolean): void {
		if (this.closed) {
			return;
		}
		const size = fstatSync(this.fd).size;
		while (
			this.offset < size &&
			(final || (this.controller.desiredSize ?? 0) > 0)
		) {
			const buffer = Buffer.allocUnsafe(
				Math.min(64 * 1024, size - this.offset),
			);
			const count = readSync(this.fd, buffer, 0, buffer.length, this.offset);
			if (count === 0) {
				break;
			}
			this.offset += count;
			this.controller.enqueue(buffer.subarray(0, count));
		}
	}

	finish(): void {
		if (!this.closed) {
			this.drain(true);
			this.closed = true;
			this.controller.close();
		}
	}

	fail(error: unknown): void {
		if (!this.closed) {
			this.closed = true;
			this.controller.error(error);
		}
	}

	[Symbol.dispose](): void {
		if (!this.disposed) {
			this.disposed = true;
			closeSync(this.fd);
		}
	}
}

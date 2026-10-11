import type { Resource } from "webappwiz/disposable";

/**
 * Ps is the process seam. Typically, this is assigned the variable name `ps`.
 */
export interface Ps {
	platform: NodeJS.Platform;
	pid: number;
	hostname: string;
	/**
	 * What the program was invoked with, past the runtime and the script: the
	 * arguments a cli parses.
	 */
	args: string[];
	/**
	 * The runtime and the entry point this program runs as, ahead of `args`:
	 * what starts it again, as a supervisor restarting its child does.
	 */
	self: string[];
	/** Whether a pid on *this* host is still running. */
	alive(pid: number): boolean;
	spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult>;
	spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult>;
	/**
	 * Starts `argv` with its stdin, stdout and stderr left open as streams, for
	 * a child spoken to while it runs, as over a protocol on its stdio.
	 */
	start(argv: string[], opts?: StartOptions): Child;
	/**
	 * Starts `argv` on a pseudo-terminal of its own, the way a terminal window
	 * runs a shell, as its controlling terminal so ^C and resizes reach the
	 * job in front. POSIX on Bun only, since `Bun.Terminal` is.
	 */
	startOnTerminal(argv: string[], opts: TerminalOptions): TerminalChild;
	/** The working directory, as `cd` last left it. */
	cwd(): string;
	env(name: string): string | undefined;
	cd(path: string): void;
	exit(code: number): void;
	/** Listens until the returned resource is disposed. */
	on(signal: string, handler: (...args: unknown[]) => void): Resource;
	once(event: "exit", handler: () => void): Resource;
}

export interface SpawnOptions {
	/** Added to the current environment, not a replacement for it. */
	env?: Record<string, string>;
	/**
	 * Taken out of the environment the child inherits, so it sees them unset
	 * rather than empty. `env` wins over it for a name in both.
	 */
	unset?: string[];
	cwd?: string;
	/**
	 * Written to the child's stdin, which is then closed. Without it the child
	 * shares this process's stdin. Only `spawnCapture` honors it.
	 */
	stdin?: string;
	/** Kills the child with SIGTERM once it has run this long. */
	timeoutMs?: number;
	/** Kills the child with SIGTERM when it aborts, and rejects the spawn. */
	signal?: AbortSignal;
	/**
	 * Sees the output as it arrives, for progress on a long command. The
	 * result still holds all of it. Only `spawnCapture` honors it.
	 */
	watcher?: OutputWatcher;
}

/** What watches a spawned command's output as it comes. */
export interface OutputWatcher {
	stdout(chunk: string): void;
	stderr(chunk: string): void;
}

export interface SpawnResult {
	exitCode: number;
}

export interface SpawnCaptureResult extends SpawnResult {
	stdout: string;
	stderr: string;
}

/** What `start` honors of a spawn's options: none that wait for the end. */
export type StartOptions = Omit<SpawnOptions, "stdin" | "watcher">;

/** Where and how big a terminal starts. */
export interface TerminalOptions extends StartOptions {
	cols: number;
	rows: number;
}

/** A child still running, its stdio open: bytes in, bytes out. */
export interface Child {
	stdin: WritableStream<Uint8Array>;
	stdout: ReadableStream<Uint8Array>;
	stderr: ReadableStream<Uint8Array>;
	/** Its exit code once it is gone, 128 + the signal for one killed. */
	exited: Promise<number>;
	/** Sends it `signal`, SIGTERM by default; nothing once it has exited. */
	kill(signal?: NodeJS.Signals): void;
}

/** A child on a terminal: what it writes, and keys typed at it. */
export interface TerminalChild {
	/** What the child writes to its terminal; ends once the terminal closes. */
	output: ReadableStream<Uint8Array>;
	/** Types `data` at the child, keys and pastes alike. */
	write(data: string | Uint8Array): void;
	/** What a window resize does: the child hears of it as SIGWINCH. */
	resize(cols: number, rows: number): void;
	/** Its exit code once it is gone, 128 + the signal for one killed. */
	exited: Promise<number>;
	/** Sends it `signal`, SIGTERM by default; nothing once it has exited. */
	kill(signal?: NodeJS.Signals): void;
	/** Closes the terminal, after which writes and resizes do nothing. */
	close(): void;
}

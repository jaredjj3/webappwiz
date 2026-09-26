/**
 * Ps is the process seam. Typically, this is assigned the variable name `ps`.
 */
export interface Ps {
	platform: NodeJS.Platform;
	pid: number;
	hostname: string;
	/**
	 * What the program was invoked with, past the runtime and the script: the
	 * arguments a cli parses. Never the executable or the entry point, which
	 * nothing here has ever wanted.
	 */
	args: string[];
	/** Whether a pid on *this* host is still running. */
	alive(pid: number): boolean;
	spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult>;
	spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult>;
	/** The working directory, as `cd` last left it. */
	cwd(): string;
	env(name: string): string | undefined;
	cd(path: string): void;
	exit(code: number): void;
	on(signal: string, handler: (...args: unknown[]) => void): void;
	once(event: "exit", handler: () => void): void;
}

export interface SpawnOptions {
	/** Added to the current environment, not a replacement for it. */
	env?: Record<string, string>;
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

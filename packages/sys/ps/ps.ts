/**
 * Ps is the process seam. Typically, this is assigned the variable name `ps`.
 */
export interface Ps {
	platform: NodeJS.Platform;
	pid: number;
	hostname: string;
	/** Whether a pid on *this* host is still running. */
	alive(pid: number): boolean;
	spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult>;
	spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult>;
	cd(path: string): void;
	exit(code: number): void;
	on(signal: string, handler: (...args: unknown[]) => void): void;
	once(event: "exit", handler: () => void): void;
}

export interface SpawnOptions {
	/** Added to the current environment, not a replacement for it. */
	env?: Record<string, string>;
	cwd?: string;
}

export interface SpawnResult {
	exitCode: number;
}

export interface SpawnCaptureResult extends SpawnResult {
	stdout: string;
	stderr: string;
}

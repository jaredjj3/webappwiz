/**
 * The parts of `process` that NodePs touches. Injecting it is what lets a test
 * keep real spawning (real subprocesses, real exit codes) without a real
 * `process.exit` killing the runner or signal handlers leaking between tests.
 */
export interface ProcessLike {
	platform: NodeJS.Platform;
	pid: number;
	argv: string[];
	env: NodeJS.ProcessEnv;
	kill(pid: number, signal: 0): boolean;
	cwd(): string;
	chdir(path: string): void;
	exit(code: number): void;
	on(event: string, handler: (...args: unknown[]) => void): void;
	once(event: string, handler: () => void): void;
}

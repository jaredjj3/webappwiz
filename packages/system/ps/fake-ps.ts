import type { Ps, SpawnCaptureResult, SpawnOptions, SpawnResult } from "./ps";

export class FakePs implements Ps {
	platform: NodeJS.Platform = "darwin";
	pid = 4242;
	hostname = "fake-host";
	args: string[] = [];

	private dead = new Set<number>();
	private path = "/";
	private vars: Record<string, string> = {};
	private calls: string[] = [];
	private dirs: string[] = [];
	private handlers = new Map<string, Array<() => void>>();
	private exitCode = 0;
	private exited = false;
	private captureOutput = { stdout: "", stderr: "" };
	private simulation = () => Promise.resolve(0);

	alive(pid: number): boolean {
		return !this.dead.has(pid);
	}

	/** Marks a pid dead, so `alive` reports false for it. */
	kill(pid: number): void {
		this.dead.add(pid);
	}

	async spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult> {
		if (!this.exited) {
			this.record(argv, opts);
			await this.simulation();
		}
		return { exitCode: this.exitCode };
	}

	async spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult> {
		if (!this.exited) {
			this.record(argv, opts);
			await this.simulation();
		}
		return {
			exitCode: this.exitCode,
			stdout: this.captureOutput.stdout,
			stderr: this.captureOutput.stderr,
		};
	}

	cwd(): string {
		return this.path;
	}

	env(name: string): string | undefined {
		return this.vars[name];
	}

	cd(path: string): void {
		if (!this.exited) {
			this.path = path;
		}
	}

	exit(code: number): void {
		if (!this.exited) {
			this.exitCode = code;
			this.exited = true;
		}
	}

	on(signal: string, handler: () => void): void {
		const handlers = this.handlers.get(signal) ?? [];
		handlers.push(handler);
		this.handlers.set(signal, handlers);
	}

	once(event: "exit", handler: () => void): void {
		const wrapped = () => {
			handler();
			const handlers = this.handlers.get(event) ?? [];
			const index = handlers.indexOf(wrapped);
			if (index !== -1) {
				handlers.splice(index, 1);
			}
		};
		this.on(event, wrapped);
	}

	// judge-ignore objects-over-callbacks: a test knob on a fake, where what a spawn does is one expression, so an interface would only ask every test to wrap that expression in an object literal
	simulate(simulation: () => Promise<number>): void {
		this.simulation = simulation;
	}

	setCaptureOutput(stdout: string, stderr: string): void {
		this.captureOutput = { stdout, stderr };
	}

	setEnv(vars: Record<string, string>): void {
		this.vars = { ...this.vars, ...vars };
	}

	/** The fake starts at `/` unless a test says otherwise. */
	setCwd(path: string): void {
		this.path = path;
	}

	getCalls(): string[] {
		return this.calls;
	}

	/** Positionally matched to `getCalls()`. */
	getCallDirs(): string[] {
		return this.dirs;
	}

	getExitCode(): number {
		return this.exitCode;
	}

	dispatch(signal: string): void {
		if (!this.exited) {
			for (const handler of this.handlers.get(signal) ?? []) {
				handler();
			}
		}
	}

	isExited(): boolean {
		return this.exited;
	}

	private record(argv: string[], opts?: SpawnOptions): void {
		this.calls.push(argv.join(" "));
		this.dirs.push(opts?.cwd ?? this.path);
	}
}

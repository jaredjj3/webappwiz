import type { Ps, SpawnCaptureResult, SpawnOptions, SpawnResult } from "./ps";

export class BunPs implements Ps {
	platform: NodeJS.Platform = process.platform;

	async spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult> {
		const child = Bun.spawn(argv, {
			stdio: ["inherit", "inherit", "inherit"],
			...opts,
		});

		await child.exited;
		return { exitCode: child.exitCode ?? 0 };
	}

	async spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult> {
		const child = Bun.spawn(argv, {
			stdio: ["inherit", "pipe", "pipe"],
			...opts,
		});

		const [stdout, stderr] = await Promise.all([
			new Response(child.stdout).text(),
			new Response(child.stderr).text(),
		]);

		await child.exited;
		return { exitCode: child.exitCode ?? 0, stdout, stderr };
	}

	cd(path: string): void {
		process.chdir(path);
	}

	exit(code: number): void {
		process.exit(code);
	}

	on(signal: string, handler: () => void): void {
		process.on(signal, handler);
	}

	once(event: "exit", handler: () => void): void {
		process.once(event, handler);
	}
}

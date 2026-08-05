import { type ChildProcess, spawn } from "node:child_process";
import type { Ps, SpawnCaptureResult, SpawnOptions, SpawnResult } from "./ps";

export class NodePs implements Ps {
	platform: NodeJS.Platform = process.platform;

	async spawn(argv: string[], opts?: SpawnOptions): Promise<SpawnResult> {
		const [cmd, args] = parse(argv);
		const child = spawn(cmd, args, { ...opts, stdio: "inherit" });
		return { exitCode: await exitCode(child) };
	}

	async spawnCapture(
		argv: string[],
		opts?: SpawnOptions,
	): Promise<SpawnCaptureResult> {
		const [cmd, args] = parse(argv);
		const child = spawn(cmd, args, {
			...opts,
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

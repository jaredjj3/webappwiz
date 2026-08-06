import { ConsoleLogger, type Logger } from "@webappwiz/log";
import { Command } from "./command";

class Cli {
	private cmds = new Map<string, Command<unknown>>();

	constructor(
		readonly name: string,
		private log: Logger,
	) {}

	// unknown is the empty-options seed: `unknown & { name: string }` reduces to
	// `{ name: string }`, so options accumulate cleanly as they're declared.
	command(name: string): Command<unknown> {
		const c = new Command<unknown>(name, this.log);
		this.cmds.set(name, c); // registered by reference; chain mutates the same object
		return c;
	}

	run(argv: string[] = Bun.argv.slice(2)): unknown {
		const [name, ...rest] = argv;
		if (!name || name === "--help" || name === "-h") {
			return this.help();
		}
		const cmd = this.cmds.get(name);
		if (!cmd) {
			return this.help();
		}
		try {
			const out = cmd.exec(rest, this.name);
			// async actions reject after exec() returns, so cover that path too
			return out instanceof Promise ? out.catch((e) => this.fail(e)) : out;
		} catch (e) {
			return this.fail(e);
		}
	}

	// ponytail: message only, no stack — a bad flag is a user error, not a crash
	private fail(e: unknown): never {
		this.log.error(`error: ${e instanceof Error ? e.message : e}`);
		process.exit(1);
	}

	private help(): void {
		const cmds = [...this.cmds.values()];
		const pad = Math.max(0, ...cmds.map((c) => c.name.length));
		const lines = [
			`Usage: ${this.name} <command> [options]`,
			"",
			"Commands:",
			...cmds.map(
				(c) => `  ${c.name.padEnd(pad)}${c.summary ? `  ${c.summary}` : ""}`,
			),
			"",
			`Run \`${this.name} <command> --help\` for a command's options.`,
		];
		this.log.info(lines.join("\n"));
	}
}

export function cli(name: string, log: Logger = new ConsoleLogger()): Cli {
	return new Cli(name, log);
}

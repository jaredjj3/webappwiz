import { ConsoleLogger, type Logger } from "@webappwiz/log";
import { Command } from "./command";
import type { AnyMiddleware, Middleware } from "./middleware";

class Cli<C extends object = object> {
	private cmds = new Map<string, Command<unknown, object>>();
	private middleware: AnyMiddleware[] = [];

	constructor(
		readonly name: string,
		private log: Logger,
	) {}

	/**
	 * Wraps every command's action. Has to come before the commands it wraps:
	 * `command()` fixes the context type at the point it is called, so a later
	 * `use` would change what actions receive without changing their types.
	 */
	use<Out extends object>(middleware: Middleware<C, Out>): Cli<Out> {
		if (this.cmds.size > 0) {
			throw new Error(`${this.name}: use() must come before command()`);
		}
		this.middleware.push(middleware as unknown as AnyMiddleware);
		return this as unknown as Cli<Out>;
	}

	// unknown is the empty-options seed: `unknown & { name: string }` reduces to
	// `{ name: string }`, so options accumulate cleanly as they're declared.
	command(name: string): Command<unknown, C> {
		const c = new Command<unknown, C>(name, this.log, this.name);
		// registered by reference; chain mutates the same object
		this.cmds.set(name, c as unknown as Command<unknown, object>);
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
			const out = cmd.exec(rest, this.middleware);
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
			...cmds.map((c) => c.helpLine(pad)),
			"",
			`Run \`${this.name} <command> --help\` for a command's options.`,
		];
		this.log.info(lines.join("\n"));
	}
}

export function cli(name: string, log: Logger = new ConsoleLogger()): Cli {
	return new Cli(name, log);
}

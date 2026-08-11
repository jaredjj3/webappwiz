import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import { NodePs, type Ps } from "@webappwiz/sys";
import { Command } from "./command";
import type { AnyMiddleware, Middleware } from "./middleware";

/**
 * What a `Cli` dispatches to: a command, or a group that dispatches again.
 * `Command` satisfies it as it is, which is what lets the two nest freely.
 */
// lint-ignore one-dir-per-interface: a file-local structural type for the dispatch
// map, not an injected dependency anything hands in
interface Node {
	/** One row of the parent's help table, keyed by the name it registered under. */
	helpLine(name: string, pad: number): string;
	exec(argv: string[], outer: AnyMiddleware[]): unknown;
}

export class Cli<C extends object = object> implements Node {
	private cmds = new Map<string, Node>();
	private middleware: AnyMiddleware[] = [];
	private _description = "";

	constructor(
		readonly name: string,
		private log: Logger,
		private ps: Ps,
	) {}

	/** Only shown when this is a group, on its line in the parent's help. */
	description(description: string): this {
		this._description = description;
		return this;
	}

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
		this.cmds.set(name, c as unknown as Node);
		return c;
	}

	/**
	 * A subcommand that is itself a set of subcommands: `skills add`, `skills
	 * update`. The group is a `Cli` too, so it groups, takes middleware and
	 * prints help exactly the way the root does; only its name is longer.
	 */
	group(name: string): Cli<C> {
		const g = new Cli<C>(`${this.name} ${name}`, this.log, this.ps);
		this.cmds.set(name, g as Node);
		return g;
	}

	run(argv: string[] = Bun.argv.slice(2)): unknown {
		try {
			const out = this.exec(argv, []);
			// async actions reject after exec() returns, so cover that path too
			return out instanceof Promise ? out.catch((e) => this.fail(e)) : out;
		} catch (e) {
			return this.fail(e);
		}
	}

	/**
	 * Dispatch, with whatever middleware the levels above contribute. Errors are
	 * left to propagate: only the root's `run` ends the process, so a group
	 * nested three deep still fails once, at the top.
	 */
	exec(argv: string[], outer: AnyMiddleware[] = []): unknown {
		const [name, ...rest] = argv;
		if (!name || name === "--help" || name === "-h") {
			return this.help();
		}
		const cmd = this.cmds.get(name);
		if (!cmd) {
			return this.help();
		}
		return cmd.exec(rest, [...outer, ...this.middleware]);
	}

	// padded before it is coloured: the trailing spaces land inside the escape
	// sequence, where they are invisible, so the column still lines up
	helpLine(name: string, pad: number): string {
		return `  ${color.bold(color.blue(name.padEnd(pad)))}${this._description ? `  ${this._description}` : ""}`;
	}

	// message only, no stack: a bad flag is a user error, not a crash
	private fail(e: unknown): void {
		this.log.error(`error: ${e instanceof Error ? e.message : e}`);
		this.ps.exit(1);
	}

	private help(): void {
		const entries = [...this.cmds];
		const pad = Math.max(0, ...entries.map(([name]) => name.length));
		const lines = [
			`${color.bold("Usage:")} ${color.bold(this.name)} ${color.dim("<command> [options]")}`,
			"",
			color.bold("Commands:"),
			...entries.map(([name, c]) => c.helpLine(name, pad)),
			"",
			color.dim(
				`Run \`${this.name} <command> --help\` for a command's options.`,
			),
		];
		this.log.info(lines.join("\n"));
	}
}

export function cli(
	name: string,
	log: Logger = new ConsoleLogger(),
	ps: Ps = new NodePs(),
): Cli {
	return new Cli(name, log, ps);
}

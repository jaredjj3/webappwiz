import { ConsoleLogger, color } from "@webappwiz/log";
import { NodePs } from "@webappwiz/sys";
import { Command } from "./command";
import type { Deps } from "./deps";
import type { AnyMiddleware, Middleware } from "./middleware";

/**
 * What a `Cli` dispatches to: a command, or a group that dispatches again.
 * `Command` satisfies it as it is, which is what lets the two nest freely.
 */
// judge-ignore one-dir-per-interface: a file-local structural type for the dispatch
// map, not an injected dependency anything hands in
interface Node<D> {
	/** One row of the parent's help table, keyed by the name it registered under. */
	helpLine(name: string, pad: number): string;
	exec(argv: string[], deps: D, outer: AnyMiddleware[]): unknown;
}

/**
 * `D` is what `run` is handed and what the actions start from; `C` is what the
 * middleware has made of it by the time an action runs. Declaring a cli
 * therefore takes no dependencies at all, which is what makes the declaration
 * itself testable: build it once at module scope, run it with fakes.
 */
export class Cli<D extends Deps = Deps, C extends object = D>
	implements Node<D>
{
	private cmds = new Map<string, Node<D>>();
	private middleware: AnyMiddleware[] = [];
	private _description = "";

	constructor(readonly name: string) {}

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
	use<Out extends object>(middleware: Middleware<C, Out>): Cli<D, Out> {
		if (this.cmds.size > 0) {
			throw new Error(`${this.name}: use() must come before command()`);
		}
		this.middleware.push(middleware as unknown as AnyMiddleware);
		return this as unknown as Cli<D, Out>;
	}

	// unknown is the empty-options seed: `unknown & { name: string }` reduces to
	// `{ name: string }`, so options accumulate cleanly as they're declared.
	command(name: string): Command<unknown, C> {
		const command = new Command<unknown, C>(name, this.name);
		// registered by reference; chain mutates the same object
		this.cmds.set(name, command as unknown as Node<D>);
		return command;
	}

	/**
	 * A subcommand that is itself a set of subcommands: `skills add`, `skills
	 * update`. The group is a `Cli` too, so it groups, takes middleware and
	 * prints help exactly the way the root does; only its name is longer.
	 */
	group(name: string): Cli<D, C> {
		const group = new Cli<D, C>(`${this.name} ${name}`);
		this.cmds.set(name, group as Node<D>);
		return group;
	}

	/**
	 * The program's own dependencies; `log` and `ps` are filled in with the real
	 * ones when left out, and `argv` with the process's own arguments, so a bin
	 * only names what is its own. A test that wants fakes passes them.
	 */
	run(deps: Omit<D, keyof Deps> & Partial<Deps>, argv?: string[]): unknown {
		const ps = deps.ps ?? new NodePs();
		const full = { ...deps, log: deps.log ?? new ConsoleLogger(), ps } as D;
		try {
			const out = this.exec(argv ?? ps.args, full, []);
			// async actions reject after exec() returns, so cover that path too
			return out instanceof Promise
				? out.catch((error) => this.fail(full, error))
				: out;
		} catch (error) {
			return this.fail(full, error);
		}
	}

	/**
	 * Dispatch, with whatever middleware the levels above contribute. Errors are
	 * left to propagate: only the root's `run` ends the process, so a group
	 * nested three deep still fails once, at the top.
	 */
	exec(argv: string[], deps: D, outer: AnyMiddleware[] = []): unknown {
		const [name, ...rest] = argv;
		if (!name || name === "--help" || name === "-h") {
			return this.help(deps);
		}
		const cmd = this.cmds.get(name);
		if (!cmd) {
			return this.help(deps);
		}
		return cmd.exec(rest, deps, [...outer, ...this.middleware]);
	}

	// padded before it is coloured: the trailing spaces land inside the escape
	// sequence, where they are invisible, so the column still lines up
	helpLine(name: string, pad: number): string {
		return `  ${color.bold(color.blue(name.padEnd(pad)))}${this._description ? `  ${this._description}` : ""}`;
	}

	// message only, no stack: a bad flag is a user error, not a crash
	private fail(deps: D, error: unknown): void {
		deps.log.error(`error: ${error instanceof Error ? error.message : error}`);
		deps.ps.exit(1);
	}

	private help(deps: D): void {
		const entries = [...this.cmds];
		const pad = Math.max(0, ...entries.map(([name]) => name.length));
		const lines = [
			`${color.bold("Usage:")} ${color.bold(this.name)} ${color.dim("<command> [options]")}`,
			"",
			color.bold("Commands:"),
			...entries.map(([name, command]) => command.helpLine(name, pad)),
			"",
			color.dim(
				`Run \`${this.name} <command> --help\` for a command's options.`,
			),
		];
		deps.log.info(lines.join("\n"));
	}
}

export function cli<D extends Deps = Deps>(name: string): Cli<D> {
	return new Cli<D>(name);
}

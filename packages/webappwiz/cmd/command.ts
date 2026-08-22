import type { StandardSchemaV1 } from "@standard-schema/spec";
import { color, type Logger } from "webappwiz/log";
import { ours, type Schema, validate } from "webappwiz/t";
import type { Deps } from "./deps";
import { type AnyMiddleware, compose, type Middleware } from "./middleware";

// `parsed` is the whole command line: the positionals `arg()` declares and the
// flags `option()` does, in one object. Not a settings bag the caller can drop,
// so it leads, and the context the middleware built follows it.
type Action<O, C> = (parsed: O, ctx: C) => unknown;

/**
 * What an option or a positional is declared with. A `t` schema knows how to
 * read a command line, since a command line is made of strings; any other
 * Standard Schema is handed the string as it arrived, so a zod caller writes
 * `z.coerce.number()` where they would otherwise write `z.number()`.
 */
export type Arg<T> = Schema<T> | StandardSchemaV1<unknown, T>;

/** What a caller can say about an option or a positional beyond its schema. */
export type Meta<T> = {
	/** Supplying one makes the option or argument optional. */
	default?: T;
	/** The line the help output prints beside it. */
	description?: string;
};

/**
 * What a caller can say about a variadic argument. It has no `default`: a
 * variadic with nothing left to collect is an empty array, never missing.
 */
export type RestMeta = Pick<Meta<unknown>, "description">;

type OptionMeta = {
	name: string;
	schema: Arg<unknown>;
	description?: string;
	hasDefault: boolean;
	default?: unknown;
};

export class Command<O, C extends object = object> {
	private _description = "";
	private options: OptionMeta[] = [];
	private args: OptionMeta[] = []; // positionals, in declaration order
	private variadic: OptionMeta | undefined;
	private middleware: AnyMiddleware[] = [];
	private _action: Action<O, C> = () => {};
	private hasAction = false;
	private unknownOptions = false;
	private excessArguments = false;
	private passThrough = false;

	constructor(readonly name: string) {}

	description(description: string): this {
		this._description = description;
		return this;
	}

	// padded before it is coloured: the trailing spaces land inside the escape
	// sequence, where they are invisible, so the column still lines up
	helpLine(name: string, pad: number): string {
		return `  ${color.bold(color.blue(name.padEnd(pad)))}${this._description ? `  ${this._description}` : ""}`;
	}

	option<K extends string, T>(
		name: K,
		schema: Arg<T>,
		meta?: Meta<T>,
	): Command<O & { [P in K]: T }, C> {
		this.options.push({
			name,
			schema: schema as Arg<unknown>,
			description: meta?.description,
			// only a present `default` key makes the option optional (vs. a lone description)
			hasDefault: meta !== undefined && "default" in meta,
			default: meta?.default,
		});
		return this as unknown as Command<O & { [P in K]: T }, C>;
	}

	arg<K extends string, T>(
		name: K,
		schema: Arg<T>,
		meta?: Meta<T>,
	): Command<O & { [P in K]: T }, C> {
		if (this.variadic) {
			throw new Error(
				`${this.name}: ${this.variadic.name} takes every remaining argument, so ${name} would never be filled`,
			);
		}
		this.args.push({
			name,
			schema: schema as Arg<unknown>,
			description: meta?.description,
			hasDefault: meta !== undefined && "default" in meta,
			default: meta?.default,
		});
		return this as unknown as Command<O & { [P in K]: T }, C>;
	}

	/**
	 * The last positional, collecting every argument left over as an array. The
	 * schema describes one of them, so `rest("args", t.string())` arrives as
	 * `string[]`, empty when there was nothing left. Only one is allowed, and
	 * nothing may be declared after it.
	 */
	rest<K extends string, T>(
		name: K,
		schema: Arg<T>,
		meta?: RestMeta,
	): Command<O & { [P in K]: T[] }, C> {
		if (this.variadic) {
			throw new Error(
				`${this.name}: ${this.variadic.name} already takes every remaining argument`,
			);
		}
		this.variadic = {
			name,
			schema: schema as Arg<unknown>,
			description: meta?.description,
			hasDefault: false,
		};
		return this as unknown as Command<O & { [P in K]: T[] }, C>;
	}

	/**
	 * Lets a flag this command never declared through as an ordinary argument,
	 * for a command that forwards what it is given to another program. Declared
	 * options are still read from the same command line.
	 */
	allowUnknownOption(allow = true): this {
		this.unknownOptions = allow;
		return this;
	}

	/** Lets more arguments arrive than were declared, instead of failing. */
	allowExcessArguments(allow = true): this {
		this.excessArguments = allow;
		return this;
	}

	/**
	 * Stops reading options once the first argument has arrived, so everything
	 * past it is an argument however it is spelled. `cmd --port 80 run` reads
	 * `--port`; `cmd run --port 80` passes it on, with no `--` needed.
	 */
	passThroughOptions(passThrough = true): this {
		this.passThrough = passThrough;
		return this;
	}

	/**
	 * Wraps this command's action, inside whatever the `Cli` already wraps it
	 * with. Has to come before `action`, which is typed against the context the
	 * chain produces.
	 */
	use<Out extends object>(middleware: Middleware<C, Out>): Command<O, Out> {
		if (this.hasAction) {
			throw new Error(`${this.name}: use() must come before action()`);
		}
		this.middleware.push(middleware as unknown as AnyMiddleware);
		return this as unknown as Command<O, Out>;
	}

	action(action: Action<O, C>): this {
		this._action = action;
		this.hasAction = true;
		return this;
	}

	// Of the dependencies only the logger is this command's business; the rest of
	// the object it just seeds the context with, for the middleware and action.
	// `path` is the spelling that reached this command, for the usage line; the
	// cli dispatching here passes it, a command run standalone is just its name.
	exec(
		argv: string[],
		deps: Pick<Deps, "log">,
		outer: AnyMiddleware[] = [],
		path = this.name,
	): unknown {
		if (this.wantsHelp(argv)) {
			this.help(deps.log, path);
			return;
		}
		const opts = this.parse(argv);
		const chain = [...outer, ...this.middleware];
		// Without middleware there is nothing to await, and a sync action stays
		// sync, parse errors included.
		if (chain.length === 0) {
			return this._action(opts, deps as unknown as C);
		}
		let result: unknown;
		const run = compose(chain, async (ctx) => {
			result = await this._action(opts, ctx as C);
		});
		return run(deps).then(() => result);
	}

	/**
	 * Whether this run is asking for help rather than doing anything. Only what
	 * is still being read as an option counts: past a `--`, or past the first
	 * argument of a pass-through command, `--help` belongs to whatever this
	 * command forwards to.
	 */
	private wantsHelp(argv: string[]): boolean {
		for (let i = 0; i < argv.length; i++) {
			const token = argv[i];
			if (token === "--") {
				return false;
			}
			if (token === "--help" || token === "-h") {
				return true;
			}
			if (this.passThrough && token !== undefined && !this.isValue(argv, i)) {
				return false;
			}
		}
		return false;
	}

	// The token after a bare `--flag` is that flag's value, which is what makes
	// it not the first argument a pass-through command stops reading options at.
	private isValue(argv: string[], i: number): boolean {
		const token = argv[i];
		if (token?.startsWith("-")) {
			return true;
		}
		const previous = argv[i - 1];
		if (previous === undefined || !previous.startsWith("--")) {
			return false;
		}
		return !previous.includes("=");
	}

	private parse(argv: string[]): O {
		const raw = new Map<string, string>();
		const positional: string[] = [];
		for (let i = 0; i < argv.length; i++) {
			const token = argv[i];
			if (token === undefined) {
				continue;
			}
			// a bare `--` ends option processing: what follows is arguments, however
			// it is spelled, and the separator itself is not one of them
			if (token === "--") {
				positional.push(...argv.slice(i + 1));
				break;
			}
			const stopped = this.passThrough && positional.length > 0;
			if (!token.startsWith("--") || stopped) {
				positional.push(token);
				continue;
			}
			const eq = token.indexOf("=");
			const name = eq === -1 ? token.slice(2) : token.slice(2, eq);
			// Before anything binds: a typo is likelier than a missing value, so
			// `cmd --grep x` reports the flag it does not know rather than the
			// argument it thinks you left out. A command that forwards its arguments
			// says so, and then an unknown flag is one of them.
			if (!this.options.some((option) => option.name === name)) {
				if (!this.unknownOptions) {
					throw new Error(`unknown option --${name}`);
				}
				// no value is taken with it: the parser cannot know the arity of a
				// flag it has never heard of, so the next token stands on its own
				positional.push(token);
				continue;
			}
			if (eq !== -1) {
				raw.set(name, token.slice(eq + 1));
			} else {
				const next = argv[i + 1];
				if (next !== undefined && !next.startsWith("--")) {
					raw.set(name, next);
					i++;
				} else {
					raw.set(name, "true"); // bare flag
				}
			}
		}
		const extra = positional[this.args.length];
		if (extra !== undefined && !this.variadic && !this.excessArguments) {
			throw new Error(`unexpected argument "${extra}"`);
		}
		const out: Record<string, unknown> = {};
		// positionals bind by order, so a bare flag before them steals one
		// (`cmd --force task`). Put flags last, or add arity to option().
		this.args.forEach((arg, i) => {
			const value = positional[i];
			if (value === undefined) {
				if (arg.hasDefault) {
					out[arg.name] = arg.default;
					return;
				}
				// a schema that accepts absence already says it is allowed, so asking
				// for `default: undefined` as well would be saying it twice
				const missing = absent(arg.schema);
				if (missing !== null) {
					out[arg.name] = missing.value;
					return;
				}
				throw new Error(`missing required argument <${arg.name}>`);
			}
			out[arg.name] = read(arg.schema, value);
		});
		if (this.variadic) {
			const rest = this.variadic;
			out[rest.name] = positional
				.slice(this.args.length)
				.map((value) => read(rest.schema, value));
		}
		for (const opt of this.options) {
			const value = raw.get(opt.name);
			if (value === undefined) {
				if (opt.hasDefault) {
					out[opt.name] = opt.default;
					continue;
				}
				const missing = absent(opt.schema);
				if (missing !== null) {
					out[opt.name] = missing.value;
					continue;
				}
				throw new Error(`missing required option --${opt.name}`);
			}
			out[opt.name] = read(opt.schema, value);
		}
		return out as O;
	}

	private optionRow(option: OptionMeta): readonly [string, string] {
		// an undefined default is the option being absent, which is not news
		const defaultDescription =
			option.hasDefault && option.default !== undefined
				? color.dim(` (default: ${JSON.stringify(option.default)})`)
				: "";
		return [
			`--${option.name}`,
			`${option.description ?? ""}${defaultDescription}`,
		];
	}

	private help(log: Logger, path: string): void {
		const args = this.args.map((arg) =>
			arg.hasDefault ? `[${arg.name}]` : `<${arg.name}>`,
		);
		if (this.variadic) {
			args.push(`[${this.variadic.name}...]`);
		}
		const usage = [
			color.bold(path),
			color.dim([...args, "[options]"].join(" ")),
		].join(" ");
		const lines = [`${color.bold("Usage:")} ${usage}`];
		if (this._description) {
			lines.push("", this._description);
		}
		const named = this.variadic
			? [...this.args, { ...this.variadic, name: `${this.variadic.name}...` }]
			: this.args;
		if (named.length > 0) {
			lines.push("", color.bold("Arguments:"));
			const pad = Math.max(...named.map((arg) => arg.name.length));
			for (const arg of named) {
				lines.push(
					`  ${color.blue(arg.name.padEnd(pad))}  ${arg.description ?? ""}`.trimEnd(),
				);
			}
		}
		lines.push("", color.bold("Options:"));
		const rows = [
			...this.options.map((option) => this.optionRow(option)),
			["-h, --help", "show this help"] as const,
		];
		const pad = Math.max(...rows.map(([flag]) => flag.length));
		for (const [flag, text] of rows) {
			lines.push(`  ${color.blue(flag.padEnd(pad))}  ${text}`.trimEnd());
		}
		log.info(lines.join("\n"));
	}
}

/**
 * One command-line token as the value its schema says it is. A `t` schema
 * coerces, because it was built knowing the input is a string. Anything else
 * gets the string handed to it, which is why a foreign schema has to be one
 * that accepts strings.
 */
function read<T>(schema: Arg<T>, raw: string): T {
	return ours(schema) ? schema.coerce(raw) : validate(schema, raw);
}

/**
 * What an absent option or argument binds to, or nothing when leaving it out is
 * not allowed.
 *
 * The question is put by validating absence, which is the only way to put it
 * that every schema can answer: `isOptional` is ours and the interface has no
 * equivalent. Asking this way costs nothing and gains something, since a schema
 * carrying its own default answers with that default rather than with nothing.
 */
function absent(schema: Arg<unknown>): { value: unknown } | null {
	const result = schema["~standard"].validate(undefined);
	if (result instanceof Promise || result.issues !== undefined) {
		return null;
	}
	return { value: result.value };
}

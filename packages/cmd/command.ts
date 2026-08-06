import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Schema } from "./schema";

// unknown return so `.action(() => doThing())` type-checks and async actions
// propagate their Promise out through run() for top-level await.
type Handler<O> = (opts: O) => unknown;

type OptionMeta = {
	name: string;
	schema: Schema<unknown>;
	description?: string;
	hasDefault: boolean;
	default?: unknown;
};

// `.option()` accumulates its value type into `O`, so `.action`'s param is
// fully inferred from the options declared before it.
export class Command<O> {
	private desc = "";
	private options: OptionMeta[] = [];
	private handler: Handler<O> = () => {};

	constructor(
		readonly name: string,
		private log: Logger = new ConsoleLogger(),
	) {}

	get summary(): string {
		return this.desc;
	}

	description(text: string): this {
		this.desc = text;
		return this;
	}

	option<K extends string, T>(
		name: K,
		schema: Schema<T>,
		meta?: { default?: T; description?: string },
	): Command<O & { [P in K]: T }> {
		this.options.push({
			name,
			schema: schema as Schema<unknown>,
			description: meta?.description,
			// only a present `default` key makes the option optional (vs. a lone description)
			hasDefault: meta !== undefined && "default" in meta,
			default: meta?.default,
		});
		return this as unknown as Command<O & { [P in K]: T }>;
	}

	action(fn: Handler<O>): this {
		this.handler = fn;
		return this;
	}

	exec(argv: string[], prog = ""): unknown {
		if (argv.includes("--help") || argv.includes("-h")) {
			this.printHelp(prog);
			return undefined;
		}
		return this.handler(this.parse(argv));
	}

	private parse(argv: string[]): O {
		const raw = new Map<string, string>();
		for (let i = 0; i < argv.length; i++) {
			const token = argv[i];
			if (token === undefined || !token.startsWith("--")) {
				continue; // ponytail: no positionals yet, add an .arg() chain when needed
			}
			const eq = token.indexOf("=");
			if (eq !== -1) {
				raw.set(token.slice(2, eq), token.slice(eq + 1));
			} else {
				const next = argv[i + 1];
				if (next !== undefined && !next.startsWith("--")) {
					raw.set(token.slice(2), next);
					i++;
				} else {
					raw.set(token.slice(2), "true"); // bare flag
				}
			}
		}
		const out: Record<string, unknown> = {};
		for (const opt of this.options) {
			const value = raw.get(opt.name);
			if (value === undefined) {
				if (opt.hasDefault) {
					out[opt.name] = opt.default;
					continue;
				}
				throw new Error(`missing required option --${opt.name}`);
			}
			out[opt.name] = opt.schema.parse(value);
		}
		return out as O;
	}

	private printHelp(prog: string): void {
		const usage = [prog, this.name, "[options]"].filter(Boolean).join(" ");
		const lines = [`Usage: ${usage}`];
		if (this.desc) {
			lines.push("", this.desc);
		}
		lines.push("", "Options:");
		const rows = [
			...this.options.map((o) => {
				const def = o.hasDefault
					? ` (default: ${JSON.stringify(o.default)})`
					: "";
				return [`--${o.name}`, `${o.description ?? ""}${def}`] as const;
			}),
			["-h, --help", "show this help"] as const,
		];
		const pad = Math.max(...rows.map(([flag]) => flag.length));
		for (const [flag, text] of rows) {
			lines.push(`  ${flag.padEnd(pad)}  ${text}`.trimEnd());
		}
		this.log.info(lines.join("\n"));
	}
}

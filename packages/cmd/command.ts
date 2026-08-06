import { ConsoleLogger, type Logger } from "@webappwiz/log";
import type { Schema } from "@webappwiz/t";

type Action<O> = (opts: O) => unknown;

type OptionMeta = {
	name: string;
	schema: Schema<unknown>;
	description?: string;
	hasDefault: boolean;
	default?: unknown;
};

export class Command<O> {
	private _description = "";
	private options: OptionMeta[] = [];
	private args: OptionMeta[] = []; // positionals, in declaration order
	private _action: Action<O> = () => {};

	constructor(
		readonly name: string,
		private log: Logger = new ConsoleLogger(),
		private program = "", // program name for the usage line; empty when run standalone
	) {}

	description(description: string): this {
		this._description = description;
		return this;
	}

	helpLine(pad: number): string {
		return `  ${this.name.padEnd(pad)}${this._description ? `  ${this._description}` : ""}`;
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

	arg<K extends string, T>(
		name: K,
		schema: Schema<T>,
		meta?: { default?: T; description?: string },
	): Command<O & { [P in K]: T }> {
		this.args.push({
			name,
			schema: schema as Schema<unknown>,
			description: meta?.description,
			hasDefault: meta !== undefined && "default" in meta,
			default: meta?.default,
		});
		return this as unknown as Command<O & { [P in K]: T }>;
	}

	action(action: Action<O>): this {
		this._action = action;
		return this;
	}

	exec(argv: string[]): unknown {
		if (argv.includes("--help") || argv.includes("-h")) {
			this.help();
		} else {
			const opts = this.parse(argv);
			return this._action(opts);
		}
	}

	private parse(argv: string[]): O {
		const raw = new Map<string, string>();
		const positional: string[] = [];
		for (let i = 0; i < argv.length; i++) {
			const token = argv[i];
			if (token === undefined) {
				continue;
			}
			if (!token.startsWith("--")) {
				positional.push(token);
				continue;
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
		// ponytail: positionals bind by order, so a bare flag before them steals
		// one (`cmd --force task`). Put flags last, or add arity to option().
		this.args.forEach((arg, i) => {
			const value = positional[i];
			if (value === undefined) {
				if (!arg.hasDefault) {
					throw new Error(`missing required argument <${arg.name}>`);
				}
				out[arg.name] = arg.default;
				return;
			}
			out[arg.name] = arg.schema.parse(value);
		});
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

	// a [flag, text] pair for the help table, e.g. ["--count", "how many (default: 1)"]
	private optionRow(o: OptionMeta): readonly [string, string] {
		const defaultDescription = o.hasDefault
			? ` (default: ${JSON.stringify(o.default)})`
			: "";
		return [`--${o.name}`, `${o.description ?? ""}${defaultDescription}`];
	}

	private help(): void {
		const args = this.args.map((a) =>
			a.hasDefault ? `[${a.name}]` : `<${a.name}>`,
		);
		const usage = [this.program, this.name, ...args, "[options]"]
			.filter(Boolean)
			.join(" ");
		const lines = [`Usage: ${usage}`];
		if (this._description) {
			lines.push("", this._description);
		}
		if (this.args.length > 0) {
			lines.push("", "Arguments:");
			const pad = Math.max(...this.args.map((a) => a.name.length));
			for (const a of this.args) {
				lines.push(`  ${a.name.padEnd(pad)}  ${a.description ?? ""}`.trimEnd());
			}
		}
		lines.push("", "Options:");
		const rows = [
			...this.options.map((o) => this.optionRow(o)),
			["-h, --help", "show this help"] as const,
		];
		const pad = Math.max(...rows.map(([flag]) => flag.length));
		for (const [flag, text] of rows) {
			lines.push(`  ${flag.padEnd(pad)}  ${text}`.trimEnd());
		}
		this.log.info(lines.join("\n"));
	}
}

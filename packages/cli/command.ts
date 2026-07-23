import type { Schema } from "./schema";

// unknown return so `.action(() => doThing())` type-checks and async actions
// propagate their Promise out through run() for top-level await.
type Handler<O> = (opts: O) => unknown;

// `.option()` accumulates its value type into `O`, so `.action`'s param is
// fully inferred from the options declared before it.
export class Command<O> {
  private desc = "";
  private opts = new Map<string, Schema<unknown>>();
  private handler: Handler<O> = () => {};

  constructor(readonly name: string) {}

  get summary(): string {
    return this.desc;
  }

  description(text: string): this {
    this.desc = text;
    return this;
  }

  option<K extends string, T>(name: K, schema: Schema<T>): Command<O & { [P in K]: T }> {
    this.opts.set(name, schema as Schema<unknown>);
    return this as unknown as Command<O & { [P in K]: T }>;
  }

  action(fn: Handler<O>): this {
    this.handler = fn;
    return this;
  }

  exec(argv: string[]): unknown {
    return this.handler(this.parse(argv));
  }

  private parse(argv: string[]): O {
    const raw = new Map<string, string>();
    for (let i = 0; i < argv.length; i++) {
      const tok = argv[i];
      if (tok === undefined || !tok.startsWith("--")) continue; // ponytail: no positionals yet, add an .arg() chain when needed
      const eq = tok.indexOf("=");
      if (eq !== -1) {
        raw.set(tok.slice(2, eq), tok.slice(eq + 1));
      } else {
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith("--")) {
          raw.set(tok.slice(2), next);
          i++;
        } else {
          raw.set(tok.slice(2), "true"); // bare flag
        }
      }
    }
    const out: Record<string, unknown> = {};
    for (const [name, schema] of this.opts) {
      const value = raw.get(name);
      // ponytail: options are required by default; add .option(name, schema, {default}) when optionals are needed
      if (value === undefined) throw new Error(`missing required option --${name}`);
      out[name] = schema.parse(value);
    }
    return out as O;
  }
}

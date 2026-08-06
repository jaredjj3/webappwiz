# @webappwiz/cmd

Builds a CLI: subcommands, positional `.arg()`s and `--flag` options typed by
[@webappwiz/t](../t), and generated `--help`.

```ts
import { cli } from "@webappwiz/cmd";
import { t } from "@webappwiz/t";

const app = cli("app");

app
	.command("greet")
	.description("say hello")
	.arg("name", t.string(), { description: "who to greet" })
	.option("loud", t.boolean(), { default: false })
	.action((opts) => console.log(opts.loud ? "HI" : "hi", opts.name));

await app.run();
```

```bash
app greet ada --loud
```

An arg or option without a `default` is required. Their types accumulate, so
`opts` is fully typed in `action`. Args bind by declaration order, so put
flags after them: `app greet --loud ada` reads `ada` as the value of `--loud`.

## Middleware

`use` wraps a command's action with setup, teardown, and whatever an action
should not be doing itself. What a middleware hands to `next` becomes the
context the action receives, so the context type accumulates the way options
do.

```ts
function database(url: string): Middleware<object, { db: Db }> {
	return async (ctx, next) => {
		const db = await connect(url);
		try {
			await next({ ...ctx, db });
		} finally {
			await db.close();
		}
	};
}

const app = cli("app").use(database(process.env.DATABASE_URL));

app
	.command("users")
	.action((opts, ctx) => ctx.db.query("select * from users"));
```

Middleware runs after `--help` and after options are parsed, so it only ever
wraps the action — `app users --help` never opens the connection, and a bad
flag still fails before any setup happens.

`use` must come before the things it wraps: `cli.use` before `command`, and
`command.use` before `action`, both of which fix the context type at the point
they are called. Either one throws if called late. A command's own middleware
runs inside the cli's.

Middleware factories that declare a `Middleware<C, Out>` return type infer at
the call site. Inline middleware needs its output context spelled out —
TypeScript will not infer a type argument from how a callback parameter is
used:

```ts
app.use<{ user: string }>(async (ctx, next) => next({ ...ctx, user: "ada" }));
```

With no middleware registered, a synchronous action still returns
synchronously; only a chain makes `run` return a promise.

# webappwiz/config

A validated, frozen record of settings, for when the values arrive from an
untyped context: `process.env`, a JSON file, CLI flags. Declare the shape once
with [webappwiz/t](../t), and every `Config` made from it has already passed
the schema: there is no constructor to reach around.

If the settings never leave typed code, you don't need this: a plain interface
and an object literal already give you everything `Config` would.

```ts
import { Config } from "webappwiz/config";
import { t } from "webappwiz/t";

const settings = Config.factory({
	host: t.string(),
	port: t.number(),
});

const config = settings.parse(JSON.parse(raw));
config.get("port"); // number
config.toRecord(); // frozen { host: string; port: number }
```

`parse` throws a `SchemaError` naming the key that failed. `update` merges and
revalidates into a new `Config`, leaving the original untouched:

```ts
const next = config.update({ port: 9090 });
```

To name the config type a factory produces, use `InferConfig`:

```ts
import type { InferConfig } from "webappwiz/config";

type Settings = InferConfig<typeof settings>;
```

# @webappwiz/cmd

Builds a CLI: subcommands, `--flag` options typed by [@webappwiz/t](../t),
and generated `--help`.

```ts
import { cli } from "@webappwiz/cmd";
import { t } from "@webappwiz/t";

const app = cli("app");

app
	.command("greet")
	.description("say hello")
	.option("name", t.string(), { description: "who to greet" })
	.option("loud", t.boolean(), { default: false })
	.action((opts) => console.log(opts.loud ? "HI" : "hi", opts.name));

await app.run();
```

An option without a `default` is required. Option types accumulate, so
`opts` is fully typed in `action`.

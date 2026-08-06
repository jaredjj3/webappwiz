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

# webappwiz/creds

API keys and tokens, each named the way its environment variable is, read from
the environment first and then from the operating system's secret store. A
value lives encrypted in the store rather than in a `.env` file, so it is in
every git worktree of the project without being in any of them, and an agent
building or running the code uses it without ever being shown it.

```ts
import { Credentials, SystemSecretStore } from "webappwiz/creds";

const credentials = new Credentials(new SystemSecretStore("my-app"));
const key = await credentials.require("STRIPE_SECRET_KEY");
```

`require` throws when neither has it, saying how a person sets it; the error
never holds a value. `get` is the same with undefined instead, and `source`
says where a value would come from (`environment`, `store` or `missing`)
without reading it out.

`SystemSecretStore` keeps values under the service `webappwiz:<project>`
through `Bun.secrets`: the Keychain on macOS, Credential Manager on Windows,
and on Linux a running secret service daemon such as GNOME Keyring or
KWallet. A headless Linux box often has none; there the environment is how a
value arrives, the way it is in CI. The store cannot list what it holds, so
code names what it needs.

People put values in with the CLI, which reads them at a hidden prompt:

```bash
bunx @webappwiz/cli creds add STRIPE_SECRET_KEY
bunx @webappwiz/cli creds list
bunx @webappwiz/cli creds remove STRIPE_SECRET_KEY
```

The project the CLI stores under is the repository's directory name, unless
`.wiz/config.ts` says otherwise; pass the same name to `SystemSecretStore`.
Name each credential a project uses in `.wiz/config.ts`, so `list` can show
them:

```ts
export default {
	credentials: {
		names: { STRIPE_SECRET_KEY: "Stripe, for checkout" },
	},
};
```

`FakeSecretStore` in `webappwiz/creds/testing` is a map, so a test says
what is kept and sees what changed.

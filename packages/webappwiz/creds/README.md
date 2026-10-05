# webappwiz/creds

API keys and tokens, each named the way its environment variable is, read
from the sources the caller lists, the first with a value winning. The same
code reads them wherever it runs; only the list changes. Where the app is
deployed, that is the environment and maybe a `.env` file. On a person's
machine it is the operating system's secret store, where a value lives
encrypted rather than in a file, so it is in every git worktree of the
project without being in any of them, and an agent building or running the
code uses it without ever being shown it.

```ts
import {
	Credentials,
	DotenvFile,
	Environment,
	SystemSecretStore,
} from "webappwiz/creds";

const credentials =
	process.env.APP_ENV === "development"
		? new Credentials([
				await SystemSecretStore.forProject(),
				SystemSecretStore.device(),
			])
		: new Credentials([new Environment(), new DotenvFile(".env")]);

const key = await credentials.require("STRIPE_SECRET_KEY");
```

Which sources, in what order, and how the app tells where it is running are
the caller's to choose. The development list above reads only the store, so
a stray export or a forgotten `.env` is never what a dev run picks up.

- `Environment` is the process's environment variables. Bun loads a
  project's `.env` files into them itself, so under Bun it reads those too.
- `DotenvFile` reads `NAME=value` lines from one file, once. A missing file
  has nothing rather than failing.
- `SystemSecretStore` keeps values through `Bun.secrets`: the Keychain on
  macOS, Credential Manager on Windows, and on Linux a running secret
  service daemon such as GNOME Keyring or KWallet. `forProject(dir?)` is the
  project's, kept as `webappwiz:<project>`; `device()` is the one every
  project on the machine shares, kept as `webappwiz`. A headless server
  often has no secret service, which is why a deployed app lists the
  environment instead.

`Credentials` is a source itself, so a fallback pattern of your own is a
list of lists, and any object with a `label` and an async `get(name)` is a
source, such as one over a hosted secrets manager:

```ts
const vault: CredentialSource = {
	label: "the team vault",
	get: (name) => vaultClient.read(`app/${name}`),
};
const credentials = new Credentials([
	vault,
	new Credentials([new Environment(), new DotenvFile(".env")]),
]);
```

`require` throws when no source has it, naming where it looked; the error
never holds a value. `get` is the same with undefined instead, and `source`
says which source a value would come from without reading it out. A source
need not list what it holds, so code names what it needs. A `SecretStore`
lists its own with `names()`: the system cannot list a service's entries, so
`SystemSecretStore` keeps one more, `.names`, listing the rest, and refuses
any name an environment variable cannot have.

People put values in the stores with the CLI, which reads them at a hidden
prompt:

```bash
bunx @webappwiz/cli creds add STRIPE_SECRET_KEY
bunx @webappwiz/cli creds add CLOUDFLARE_API_TOKEN --device
bunx @webappwiz/cli creds list
bunx @webappwiz/cli creds remove STRIPE_SECRET_KEY
bunx @webappwiz/cli creds run -- bunx prisma migrate dev
```

`creds run` is for tools that read only their environment: it hands the
command what the stores keep, for that run alone, and never an export of a
credential the project names.

The project's name is `credentials.project` from your own
`~/.config/wiz/config.ts`, else from the project's `.wiz/config.ts`, else
the directory of the repository's main worktree, and `forProject` finds it
the same way the CLI does. `add` takes any name, and `list` shows what the
stores keep. Name the credentials a project needs in `.wiz/config.ts`, so
`list` shows one as missing until someone keeps it:

```ts
export default {
	credentials: {
		names: { STRIPE_SECRET_KEY: "Stripe, for checkout" },
	},
};
```

`FakeSecretStore` in `webappwiz/creds/testing` is a map, so a test says
what is kept and sees what changed.

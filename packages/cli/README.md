# @webappwiz/cli

Keeps a project in step with a webappwiz release, and checks a change against
the project's rules like a linter.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills list            # what there is, and what you have
bunx @webappwiz/cli skills add scry        # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli scry                   # check the files here against the rules
bunx @webappwiz/cli scry test              # run the tests beside each rule
bunx @webappwiz/cli scry eval              # score the rules on their labeled cases
bunx @webappwiz/cli scry why <path:line>   # what a model was asked about a line
bunx @webappwiz/cli scry list              # every rule there is, and what you have
bunx @webappwiz/cli scry add <id>          # copy a shipped rule in
bunx @webappwiz/cli scry add --recommended # copy the recommended ones
bunx @webappwiz/cli scry update            # refresh the copies
bunx @webappwiz/cli scry remove <id>       # delete a rule
bunx @webappwiz/cli creds                   # the API keys the project uses, never their values
bunx @webappwiz/cli creds add <NAME>          # keep one, typed at a hidden prompt
bunx @webappwiz/cli creds remove <NAME>
bunx @webappwiz/cli creds run -- <command>    # run it with the stored keys in its environment
```

## scry

A project's rules live in `.wiz/scry`, tracked with its code, one directory
per rule holding a `rule.ts` whose class checks it and declares its
settings, a `RULE.md` that says in prose what the rule wants and why, a
`rule.test.ts`, and `evals/`, its labeled cases. The ones that
ship come from [`@webappwiz/scry`](../scry)'s catalog, and a project's own
sit beside them in the same shape. The `scry` skill teaches an agent to
write them, and the [package README](../scry/README.md) says how a check is
written.

### Checking a change

```
$ bunx @webappwiz/cli scry --since main
src/list.ts
  32   warning   91%    Settings go in one named opts object, after the parameters a caller cannot leave out.   named-options-last

src/catalog.test.ts
  35   error     100%   A test carries no if and no for; a matcher decides what the logic would have.           matchers-over-test-logic

✖ 2 problems (1 error, 1 warning) in 14 files since main
  asked 3 questions in 1 request, 2.1k input tokens
```

Like any linter, `scry` checks every file under the working directory,
or under the paths it is given, `scry packages/api src/app.ts`, changed or
not: the tracked ones and the new ones git does not ignore. The project is
the git repository around it. `--since <ref>` checks only the files under
them that changed since the branch left the ref, committed or not:
`--since main` for a branch's work, `--since HEAD` for what is not
committed yet. It matches each rule's `files` glob against those files
and runs the matching rules' checks, every rule on every file at once;
`--rule <id>,<id>` runs only those rules.

A check is code. What code can decide, it decides, and that finding is sure:
100%. What takes judgment it asks a model, which reads the file and
answers a yes-or-no question with the probability of yes, and writes
nothing. A rule asks one of two: its `decider`, a decision model fast and
cheap enough to ask about every span, or its `llm`, a language model that
reasons before it answers, for the questions a decision model gets wrong.
The questions about one file go in one request to each, and every answer is
kept in `node_modules/.cache/webappwiz/scry`, so checking an unchanged file
again asks nothing, until a reply shows a model's name, like `jev-latest`,
stands for a new version. A finding a model decided is reported at or above its
rule's `threshold`, 0.7 by default. A change no rule asks about costs
nothing and needs no credentials. The report is for whoever fixes the code,
person or agent, to act on.

`scry why <path:line>` says what a model was asked about a line, and what it
answered: why a finding there was reported, or dropped. When nothing was
asked, code decided it.

The effort a check runs at picks both models. The credentials come
from the environment, or else from the operating system's secret store,
where `creds add` keeps them (see [creds](#creds)).

| Effort | `decider` | `llm` |
| --- | --- | --- |
| `low` | `clef-flash` | `claude-haiku-4-5` |
| `medium`, the default | `clef` | `claude-sonnet-5-5` |
| `high` | `clef` | `claude-opus-5-5` |

| Model | Provider | Credentials |
| --- | --- | --- |
| `clef`, `clef-flash` | Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| `jev-latest`, `jev-preview`, `jev-1.13.0`, ... | TypeSafe | `TYPESAFE_API_KEY` |
| `claude-sonnet-5-5`, `claude-opus-5-5`, ... | Anthropic | `ANTHROPIC_API_KEY` |

```ts
// .wiz/config.ts
import { defineConfig } from "@webappwiz/cli/config";

export default defineConfig({
	scry: {
		effort: "medium",
		models: {
			high: { decider: "jev-latest", llm: "claude-fable-5-1" },
		},
		jobs: 8,
	},
});
```

Each layer overrides the last: `.wiz/config.ts`, then the user's own
`~/.config/wiz/config.ts` (under `$XDG_CONFIG_HOME` when set), then
`WIZ_SCRY_EFFORT` and `WIZ_SCRY_JOBS`. `models` overrides only the models it
names, so the config above keeps the defaults at `low` and `medium`.
`exclude` takes globs, from the
project root, of files no rule checks, like `[".agents/**"]` for skills
copied in from elsewhere; the user's are added to the project's. A config where `@webappwiz/cli` is not
installed exports the same object without `defineConfig`. A config still
holding `agents` or `batch`, from before a rule's check
was code, `model`, from before effort picked the models, or `budget`, from
before `budgets`, is refused rather than half read, and so is
`WIZ_SCRY_MODEL`.

### Budgets

A check, or `scry eval`, runs only with `budgets` declared, in either config, saying what it
may spend in input tokens on each model. The last config to set it wins
whole, so a user's own config can loosen or tighten the project's.

```ts
scry: { budgets: "nothing" }    // ask no model: only code decides
scry: { budgets: "unlimited" }  // spend without a limit
scry: {
	budgets: [
		{ decider: "unlimited", llm: 2_000_000, per: "month" },
		{ llm: 300_000, within: "7d" },
		{ llm: 100_000, per: "check" },
	],
}
```

Each entry gives the `decider`, the `llm` or both a number of tokens,
`"nothing"` or `"unlimited"`, over a window: `per` a `"check"`, or a
calendar `"day"`, `"week"` (from Monday) or `"month"` in local time, or
`within` a rolling `"24h"`, `"7d"` or `"2w"`. Every entry holds at once, and
a model no entry names spends nothing. What each check and `scry eval`
spent is kept per user on the device, in
`~/.local/state/wiz/<project>/scry-spent.json` (under `$XDG_STATE_HOME` when
set), so every worktree of a project draws on one budget.

With a number to stay under, a check first counts what it would ask, as
`--cost` does, and when that would go over any window it refuses, saying
which, and exits 3. A question it would still ask past a budget, like one to
a model budgeted `"nothing"`, goes unasked and is reported as not checked.
`--cost` prints each budget's line: what the check would use of it, and
what would be left or how far over it would go. `--override-budget` checks
anyway, spending without a limit, and with no budget declared. `scry eval`
is held to the same budgets, and takes the same flag.

`--effort` runs one check at another effort, over the config. `--model`
and `--llm` ask another model for one run, over the effort's, so two models
can be compared on the same change: `scry --model clef` then
`scry --model jev-latest`.

`--cost` says what a check would spend before it spends it: it runs the
rules, but counts each request's input tokens rather than sending it, and
prints that instead of the report. Every question it would ask, it asks
of the counter, in the requests a check would make; what was kept from an
earlier run costs nothing, as in a check, and nothing counted is kept.
Anthropic counts Claude's tokens exactly, for free; Workers AI and TypeSafe
count only by running the model, so Clef's and Jev's are estimated from the
request's length, and the total says it is an estimate. It still needs each
model's credentials.

```
$ bunx @webappwiz/cli scry --cost
estimated 31k input tokens to check 14 files: 40 questions in 9 requests
```

While it runs on a terminal, one line on stderr counts the files done and
the questions asked, answered and found in the cache, and is erased before
the report. It draws nothing in a pipe, under CI, or with `--format json`.
`scry eval` draws the same line, counting cases.

The first ctrl-c stops early: no more requests go out, the ones out are
abandoned, and the report holds what came back, with the rest named as not
checked. A second ctrl-c quits outright.

It exits 1 when a finding is an error, 2 when a rule went unchecked on a
file, and 0 otherwise. `--format json` prints the same report as JSON, each
finding with its `confidence`, and `--jobs` overrides how many requests run
at once. Rules with no `rule.ts` yet check nothing, and the report names
them.

### Testing and evaluating rules

```
$ bunx @webappwiz/cli scry eval
rule                 right   missed   false alarms
comments-say-why     5/6     -        1
no-em-dashes         9/9     -        -

wrong
  comments-say-why   evals/rate-limiter.good.ts   line 4: Say why, not what. (74%)

✖ 14 of 15 cases right (93.3%) across 2 rules
```

`scry test [ids]` runs the tests beside each rule, which check its code with
a fake model. They import `@webappwiz/scry`, so a project adds it as a
devDependency, and `add` says so when the project's `package.json` lacks
it. `scry eval [ids]` runs each rule on its labeled cases with
the real one: the files in its `evals/`, named `<name>.good.<ext>` and
`<name>.bad.<ext>`. A bad case is right when the rule reports something in it, a good
one when it reports nothing. Run it after changing a rule's question or
`threshold` to see what moved, or once per `--model` to compare models.

### list, add, update, remove

```
rule                 level   recommended   files          ships    installed   description
no-em-dashes         error   yes           **/*.{ts,md}   0.1.0    0.1.0       No em dashes, and no en dashes between words.
one-class-per-file   error   yes           **/*.ts        0.1.0    -           A file declares one top-level class.
mine                 error   -             **/*.ts        -        local       What this project wants.
```

`list` loads every rule the project has, describing each by its class, and
refuses to list a broken one, naming the file and what is wrong instead: a
missing `rule.ts`, or a class missing a setting or giving a bad one. A
shipped rule's `RULE.md` carries the version it came from, which `list`
shows beside the one that ships. `add` copies a shipped rule
in, check and all, where it runs and can be edited; `update` refreshes those
copies and leaves the project's own alone. Both replace what is there, as
`skills` does.

A rule's `rule.ts` runs on every check, so it carries the same risk as an
agent skill: whoever installs it is trusting its code. `add` and `update`
name every one they write or change, so it can be read before the next
check.

`add --recommended` copies every rule the catalog recommends, which is the
way to start: the rules that read on any TypeScript, without the ones that
are about a stack a project may not have. It takes no rule id, so the
directory is the only positional it reads, with the flag last as everywhere
else here: `scry add ./project --recommended`. A project decides for itself
after that, since a copied rule is the project's to edit or delete.

`remove` deletes a rule's directory, check and all.

Code excuses itself from a rule with a `scry-ignore <id>: <reason>`
comment above the line, or `scry-ignore-file <id>: <reason>` for the
file. Before scry these were `rule-ignore` and `rule-ignore-file`: `scry`
still honors them and names the files that use them, so a project renames
them at its own pace.

## update

Walks a directory for every `package.json` (workspaces, nested apps, anything)
and rewrites each webappwiz dependency to one version. They are released
together, so a project running two of them at different versions is running a
combination nobody tested.

The default version is this package's own, which is the point of `bunx`: the
release you invoke is the release you get. `--version` pins something else.
`workspace:` ranges are left alone; inside a monorepo they already track each
other. Installed skills and copied rules are refreshed too. Last, it names
any credential the project uses that neither the environment nor the secret
store has, with the `creds add` command a person runs for each.

```bash
bunx @webappwiz/cli update ./apps --version 1.4.0
```

## creds

```
$ bunx @webappwiz/cli creds
project: the macOS Keychain as "webappwiz:shop"
device:  the macOS Keychain as "webappwiz"
ANTHROPIC_API_KEY       device        Anthropic, for scry's claude models
CLOUDFLARE_ACCOUNT_ID   device        Workers AI, for scry's clef and clef-flash
CLOUDFLARE_API_TOKEN    device        Workers AI, for scry's clef and clef-flash
STRIPE_SECRET_KEY       missing       Stripe, for checkout
TYPESAFE_API_KEY        environment   TypeSafe, for scry's jev models
```

API keys and tokens, kept in the operating system's secret store through
`Bun.secrets`: the Keychain on macOS, Credential Manager on Windows, and a
running secret service such as GNOME Keyring or KWallet on Linux. Each
project has a store of its own, and the device has one every project
shares, for keys that are yours rather than one project's. Code reads them
with [`webappwiz/creds`](../webappwiz/creds), from whichever sources it
lists. wiz itself reads the environment, then the project's store, then the
device's, so CI hands scry its keys the way it always has.

`list` shows every credential the project uses, where wiz would read each
from, and what it is for, and never a value, so an agent can run it to see
what is missing. `add <NAME>` asks for the value at a prompt that shows
nothing, so it is in no shell history, file or transcript, and refuses with
no terminal: a person runs it. `--device` keeps it in the device's store
instead of the project's. `--stdin` takes the value piped in instead of
asking, as in `op read op://vault/stripe | bunx @webappwiz/cli creds add
STRIPE_SECRET_KEY --stdin`. `remove <NAME>` deletes one, from the device's
store with `--device`. There is no `get`: code that needs a value reads it
itself, and nothing hands one to whoever runs a command.

`run -- <command>` is for tools that read only their environment, like
Prisma, Vite or `wrangler`: it runs the command with every credential
either store keeps, in its environment for that run
alone, and exits with the command's code. A credential the project names
comes only from a store: an exported one is replaced by the stored value,
or taken out when no store has it, so a stray export is never what a dev
run reads. The rest of the environment passes through. It names on stderr
any credential neither store has, and runs anyway.

```bash
bunx @webappwiz/cli creds run -- bunx prisma migrate dev
```

Put it in a `package.json` script, as in `"dev": "wiz creds run -- vite"`,
and no `.env` file is needed in development.

`add` takes any environment variable name, and each store keeps a list of
the names it holds, so `list` and `run` find what it keeps. The credentials
wiz uses itself are always listed. A project names those its own code needs
in `.wiz/config.ts`, so `list` shows one as missing until someone keeps it,
and says what it is for:

```ts
export default defineConfig({
	credentials: {
		names: { STRIPE_SECRET_KEY: "Stripe, for checkout" },
		project: "shop", // what the store keeps them under; the repository's directory name by default
	},
});
```

The project name defaults to the directory of the repository's main
worktree, so a value added from one git worktree is there in all of them.
`credentials.project` in your own `~/.config/wiz/config.ts` wins over the
project's.

## skills

Puts the agent skills bundled with this package into `<dir>/.agents/skills/`.
Each skill's frontmatter carries the version it came from, so a stale copy is
visible rather than merely wrong.

```bash
bunx @webappwiz/cli skills list ./project
bunx @webappwiz/cli skills add scry ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL      SHIPS  INSTALLED
arbor      1.4.0  1.3.0
scry       1.4.0  -
webappwiz  1.4.0  -
```

Three ship: `arbor`, which lands an agent's work from its own worktree;
`scry`, which writes, updates, and removes a project's rules and runs
`wiz scry`; and `webappwiz`, which sends an agent to the package's catalogue
before it writes infrastructure by hand.

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one: which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update.
The one exception is a renamed skill, which the project did choose: `update`
replaces our copy under the old name, such as `review`, with the new one.
`list` answers the one thing neither can: which version a project is actually
holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.

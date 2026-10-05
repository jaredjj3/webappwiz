# @webappwiz/cli

Keeps a project in step with a webappwiz release, and checks a change against
the project's rules like a linter.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills list            # what there is, and what you have
bunx @webappwiz/cli skills add scry        # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli scry                   # check a change against the rules
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
$ bunx @webappwiz/cli scry
src/list.ts
  32   warning   91%    Settings go in one named opts object, after the parameters a caller cannot leave out.   named-options-last

src/catalog.test.ts
  35   error     100%   A test carries no if and no for; a matcher decides what the logic would have.           matchers-over-test-logic

✖ 2 problems (1 error, 1 warning) in 14 files since main
  asked 3 questions in 1 request, 2.1k input tokens
```

With no paths, `scry` asks git what changed: the uncommitted work when
there is any, otherwise the branch since it left trunk, or whatever
`--since <ref>` names. Paths, `scry packages/api src/app.ts`, check every
file at or under them, changed or not: the tracked ones and the new ones git
does not ignore, from wherever it runs; the project is the git repository
around it. Paths with `--since <ref>` check only the files under them that
changed since it. It matches each rule's `files` glob against those files
and runs the matching rules' checks, every rule on every file at once.

A check is code. What code can decide, it decides, and that finding is sure:
100%. What takes judgment it asks a decision model, which reads the file and
answers a yes-or-no question with the probability of yes, and writes
nothing. The questions about one file go in one request, and every answer is
kept in `node_modules/.cache/webappwiz/scry`, so checking an unchanged file
again asks nothing. A finding a model decided is reported at or above its
rule's `threshold`, 0.7 by default. A change no rule asks about costs
nothing and needs no credentials. The report is for whoever fixes the code,
person or agent, to act on.

`scry why <path:line>` says what a model was asked about a line, and what it
answered: why a finding there was reported, or dropped. When nothing was
asked, code decided it.

Rules ask `clef` unless the config says otherwise. The credentials come
from the environment, or else from the operating system's secret store,
where `creds add` keeps them (see [creds](#creds)).

| Model | Provider | Credentials |
| --- | --- | --- |
| `clef`, `clef-flash` | Cloudflare Workers AI | `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN` |
| `jev-latest`, `jev-preview`, `jev-1.13.0`, ... | TypeSafe | `TYPESAFE_API_KEY` |

```ts
// .wiz/config.ts
import { defineConfig } from "@webappwiz/cli/config";

export default defineConfig({
	scry: {
		model: "clef",
		jobs: 8,
	},
});
```

Each layer overrides the last: `.wiz/config.ts`, then the user's own
`~/.config/wiz/config.ts` (under `$XDG_CONFIG_HOME` when set), then
`WIZ_SCRY_MODEL` and `WIZ_SCRY_JOBS`. `exclude` takes globs, from the
project root, of files no rule checks, like `[".agents/**"]` for skills
copied in from elsewhere; the user's are added to the project's. A config where `@webappwiz/cli` is not
installed exports the same object without `defineConfig`. A config still
holding `agents`, `budget`, `batch` or `models`, from before a rule's check
was code, is refused rather than half read.

`--model` asks another model for one run, over the config, so two models
can be compared on the same change: `scry --model clef` then
`scry --model jev-latest`.

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
project shop, saved in the macOS Keychain as "webappwiz:shop"
CLOUDFLARE_ACCOUNT_ID   store         Workers AI, for scry's clef and clef-flash
CLOUDFLARE_API_TOKEN    store         Workers AI, for scry's clef and clef-flash
STRIPE_SECRET_KEY       missing       Stripe, for checkout
TYPESAFE_API_KEY        environment   TypeSafe, for scry's jev models
```

API keys and tokens, kept in the operating system's secret store through
`Bun.secrets`: the Keychain on macOS, Credential Manager on Windows, and a
running secret service such as GNOME Keyring or KWallet on Linux. Code reads
them with [`webappwiz/credentials`](../webappwiz/credentials), the
environment first and then the store, so CI and one-off overrides work as
they always have.

`list` shows every credential the project uses, where each would come
from, and what it is for, and never a value, so an agent can run it to see
what is missing. `add <NAME>` asks for the value at a prompt that shows
nothing, so it is in no shell history, file or transcript, and refuses with
no terminal: a person runs it. `--stdin` takes the value piped in instead,
as in `op read op://vault/stripe | bunx @webappwiz/cli creds add
STRIPE_SECRET_KEY --stdin`. `remove <NAME>` deletes one. There is no `get`:
code that needs a value reads it itself, and nothing hands one to whoever
runs a command.

The credentials wiz uses itself are always listed. A project names its own
in `.wiz/config.ts`, and `add` refuses any name not there, so a typo fails
rather than keeping a value nothing reads:

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

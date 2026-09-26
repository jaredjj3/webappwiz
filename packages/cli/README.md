# @webappwiz/cli

Keeps a project in step with a webappwiz release, and checks a change against
the project's rules like a linter.

```bash
bunx @webappwiz/cli update                 # pin webappwiz deps, like bun update
bunx @webappwiz/cli skills list            # what there is, and what you have
bunx @webappwiz/cli skills add scry        # install an agent skill
bunx @webappwiz/cli skills update          # refresh the ones already installed
bunx @webappwiz/cli scry                   # check a change against the rules
bunx @webappwiz/cli scry list              # every rule there is, and what you have
bunx @webappwiz/cli scry add <id>          # copy a shipped rule in
bunx @webappwiz/cli scry add --recommended # copy the recommended ones
bunx @webappwiz/cli scry update            # refresh the copies
bunx @webappwiz/cli scry remove <id>       # delete a rule
```

## scry

A project's rules live in `.wiz/scry`, tracked with its code, one directory
per rule holding a `RULE.md` and, when it helps, `scripts/` and
`references/` beside it. The ones that ship come from
[`@webappwiz/scry`](../rules)'s catalog, and a project's own sit beside them
in the same shape. The `scry` skill teaches an agent to write them.

### Checking a change

```
$ bunx @webappwiz/cli scry
src/list.ts
  32   warning   opts comes before the required changed parameter   named-options-last

src/catalog.test.ts
  35   error     the test asserts inside a for loop                  matchers-over-test-logic

✖ 2 problems (1 error, 1 warning) in 14 files since main
```

`scry` asks git what changed: the uncommitted work when there is any,
otherwise the branch since it left trunk, or whatever `--since <ref>` names.
Paths narrow it, `scry packages/api packages/web`, to the changed files at
or under them, from wherever it runs; the project is the git repository
around it. It matches each rule's `files` glob against the changed files,
runs the matching rules' scripts, and sends prompts by `effort`: the files
that match the same rules share one, holding those rules in full once, then
each file, its diff and what the scripts flagged, up to `batch` estimated
input tokens a prompt. A rule with `effort: none` sends nothing: its scripts'
lines are its findings.

An agent is any shell command that reads a prompt on stdin and answers on
stdout, set for each effort. The prompt holds everything it needs, so give
it no tools where its CLI allows: an agent free to read the repository can
spend minutes doing so before it answers.

While an agent works, the live view shows the last line it wrote to
stderr, if any. An agent printing Claude Code's JSON is recognized by its
output, with nothing to configure: with `--output-format stream-json
--verbose --include-partial-messages` the view shows the model waiting,
thinking and writing, and with that or `--output-format json` the report
ends with what the calls really spent in tokens and dollars. Anything else
is read as text.

An effort with no command of its own uses `medium`'s, and there is no
default: a project says what it runs.

```ts
// .wiz/config.ts
import { defineConfig } from "@webappwiz/cli/config";

export default defineConfig({
	scry: {
		agents: {
			low: 'claude -p --model haiku --tools ""',
			medium:
				'claude -p --model sonnet --tools "" --output-format stream-json --verbose --include-partial-messages',
			high: "codex exec",
		},
		budget: 100_000,
		batch: 32_000,
		jobs: 4,
	},
});
```

Each layer overrides the last: `.wiz/config.ts`, then the user's own
`~/.config/wiz/config.ts` (under `$XDG_CONFIG_HOME` when set), then
`WIZ_SCRY_AGENT_LOW`, `_MEDIUM`, `_HIGH`, `WIZ_SCRY_BUDGET`,
`WIZ_SCRY_BATCH` and `WIZ_SCRY_JOBS`. The agents merge an effort at a time. A config where
`@webappwiz/cli` is not installed exports the same object without
`defineConfig`.

`budget` is the estimated input tokens, four characters a token, that a
check spends without asking. Past it, `scry` asks `Proceed? [y/N]` on stdin
before sending anything, so an agent relays a person's answer with
`echo y | bunx @webappwiz/cli scry`, and no answer means no.

While the calls run, it draws each one on stderr, queued, running with its
time, then answered or failed, redrawn in place on a terminal and a plain
line a call anywhere else. The report goes to stdout once they are done.
The first ctrl-c stops early: no more calls go out, the ones out are
abandoned, and the report holds what came back, with the rest named as not
checked. A second ctrl-c quits outright.

It exits 1 when a finding is an error, 2 when a file or script went
unchecked or the check did not run, and 0 otherwise. `--format json` prints
the same report as JSON, and `--jobs` overrides how many calls run at once.

### list, add, update, remove

```
rule                 level    effort   recommended   files          ships    installed   description
no-em-dashes         error    low      yes           **/*.{ts,md}   0.1.0    0.1.0       No em dashes, and no en dashes between words.
one-class-per-file   error    low      yes           **/*.ts        0.1.0    -           A file declares one top-level class.
mine                 error    medium   -             **/*.ts        -        local       What this project wants.
```

`list` validates the frontmatter of every rule the project has and refuses to
list a broken one, naming the file and line instead. The body is the author's,
as a skill's is. `add` copies a shipped rule in, scripts and all, where it
runs and can be edited; `update` refreshes those copies and leaves the
project's own alone. Both replace what is there, as `skills` does.

A rule's scripts run on every check, so they carry the same risk as an
agent skill: whoever installs them is trusting their code. `add` and
`update` name every script they write or change, so it can be read before
the next check.

`add --recommended` copies every rule the catalog recommends, which is the
way to start: the rules that read on any TypeScript, without the ones that
are about a stack a project may not have. It takes no rule id, so the
directory is the only positional it reads, with the flag last as everywhere
else here: `scry add ./project --recommended`. A project decides for itself
after that, since a copied rule is the project's to edit or delete.

`remove` deletes a rule's directory, scripts and all.

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
other. Installed skills and copied rules are refreshed too.

```bash
bunx @webappwiz/cli update ./apps --version 1.4.0
```

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

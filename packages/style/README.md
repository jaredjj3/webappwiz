# @webappwiz/style

Style rules agents can check. One markdown file is one rule: the file name is
the id a report cites, the title is the human name, the prose under it the
description, a `files` frontmatter glob picks the files, and `## Good` /
`## Bad` hold fenced examples:

```markdown
---
files: "**/*.ts"
---

# Single class per file

Each file exports at most one class.

## Good
​```ts
class Foo {}
​```

## Bad
​```ts
class Foo {}
class Bar {}
​```
```

A guide is a TypeScript module so composition stays typed:

```ts
// style.config.ts
import { defineStyleGuide, rule } from "@webappwiz/style";

export default defineStyleGuide([
	rule("./rules/single-class-per-file.md"),
]);
```

A rule reports as an error unless its frontmatter says `level: warning`.

Code excuses itself from a rule with a comment naming the rule's id and why:

```ts
// style-ignore classes-over-function-exports: the parser has no dependencies
export function parse(text: string): Ast {}
```

The marker covers itself, the line under it, and everything indented under
that line, so above a declaration it covers the whole declaration.
`style-ignore-file <id>: <reason>` covers the file instead. It is matched
anywhere in a line, so `#` and `<!-- -->` comments carry it too, and the
reason is required: without one the marker excuses nothing.

The guide lives in `style.config.ts` unless a command is told otherwise.
`webappwiz style check` validates it, `style ls` lists its rules, `style show
<id>` prints one in full, and `style analyze [dir]` checks the code, handing
one rule at a time to an agent and printing what comes back as lint output.

Which agent is three flags, one of which you must pass:

```bash
webappwiz style analyze --agent opus          # claude -p --model <haiku|sonnet|opus>
webappwiz style analyze --exec "codex exec"   # any command, run by a shell
webappwiz style analyze --prompt              # print the prompts, run nothing
```

There is no default: a run spends your tokens, so it will not choose for you
and exits with a usage error when given none of the three. `--exec` takes the
whole command, quoting and
all, and is handed the prompt as one trailing argument. `--prompt` is for an
agent running the guide itself: it prints each task's prompt under a
`=== <id> <rule> (<n> files) ===` header, to hand to subagents of its own.

## What a run costs

A run says what it is about to read before it reads any of it, and `--estimate`
prints that line and stops, spawning nothing:

```bash
webappwiz style analyze --estimate
# checking 211 files against 7 rules in 52 agent calls, reading 641K+ tokens
```

Because it runs nothing, `--estimate` takes no `--agent`, `--exec` or
`--prompt`, and is not subject to `--budget`: being asked to approve a number is
what you run it instead of.

The number is the prompts plus every file they name, at four bytes to the token.
It is a floor, not a price. The same file is read once per rule whose glob
matches it, which is where a run's cost actually comes from: seven rules over
360 KB of source is 2.4 MB of reading. On top of that each call pays for the
agent's own system prompt and for whatever it re-reads as it works, neither of
which is knowable from here.

Over `--budget` (200,000 tokens by default) the run asks before spending, and
answers itself with no on a terminal nobody is watching, so a scripted run stops
and says the number rather than hanging or quietly running up a bill. Passing a
budget the estimate fits under is how you say yes in advance.

`--since <ref>` checks only what git says was added or changed since that ref,
staged, unstaged or untracked alike, which is usually the cheaper answer:

```bash
webappwiz style analyze --since main --agent sonnet
```

Deletions are left out, since a violation quotes its line from disk and a file
that is gone has none. Rules that judge a directory's shape rather than a file's
contents get weaker under `--since`, because the files it hides are still part of
what they are meant to look at.

## Rules that do not need an agent

An agent is the last resort. It costs minutes and tokens every run and only
ever judges, so a rule a formatter, linter, type checker or grep could decide
outright belongs to that tool instead. Give `style check` an agent, with the
same `--agent` and `--exec` flags analyze takes, and it asks that question of
every rule and warns about the ones that answer with a tool:

```
rules/no-em-dashes.md  warning  a linter could enforce this without an agent:
                                regex for em dashes (U+2014) and en dashes
                                (U+2013) not surrounded by digits on both sides
```

A tool only wins if it decides every case the rule covers, exceptions
included, so a rule a linter would half-enforce stays with the agent. The
finding is a warning rather than an error because moving a rule out of the
guide is a judgment you make once, not something to fail a build on by
surprise: `--strict` is how you make it fail once you have decided.

Without `--agent` or `--exec`, `style check` spawns nothing and costs nothing,
exactly as before.

## API

Those commands are a thin shell over this package. `loadGuide` compiles a guide
module's rules and reports what is wrong with it; `Mechanizer` asks an agent
which of those rules a tool could enforce instead, and answers in the same
`Diagnostic` shape, so the two print as one report; `Analyzer` plans one task
per rule and chunk of matching files, hands each to an agent, and returns what came
back, calling you as each task lands so a caller can print findings as they
arrive. Rendering is the caller's: a violation carries the rule's id and level,
the file and line, the message, and that line of source read from disk.

```ts
const { rules, diagnostics } = await loadGuide(fs, "style.config.ts");
const analyzer = new Analyzer(log, fs, ps, clock);
const violations = await analyzer.analyze(
	rules,
	".",
	25,
	agentCommand({ agent: "sonnet" }),
	{ finished: (task) => console.log(task.id, task.violations.length) },
);
```

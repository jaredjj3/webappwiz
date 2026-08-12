# @webappwiz/lint

One rule format for the checks a tool can make and the ones only an agent
can. A rule is a class beside its markdown: the class says what the rule
applies to and how, if at all, a linter decides it; the document says what the
rule is, to a human and to an agent, in `## Good` and `## Bad` examples.

```ts
// rule/one-class-per-file.ts
import doc from "./one-class-per-file.md" with { type: "text" };
import type { Rule } from "./rule";

export class OneClassPerFile implements Rule {
	private static readonly MESSAGE =
		"more than one class in this file: give each its own file";

	readonly id = "one-class-per-file";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check(text: string): Finding[] {
		...
	}
}
```

The document holds the prose and nothing configurable, so a rule states each
thing once:

```markdown
# One class per file

A class is a file's whole idea; a second one wants a file of its own.

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

A rule that implements `check` is enforced by the linter for free on every
`wiz fix`. A rule without one is judged by an agent, on demand, through `lint
analyze`. `partial = true` is both: the linter decides the cases a token scan
can see and the agent reads the rest. The rule's examples keep the two halves
honest: a check must pass every `## Good` block, and a full check must catch
every `## Bad` block, so the document and the implementation cannot drift
apart.

## The guide

A guide is a TypeScript module so composition stays typed. It lives in
`lint.config.ts` unless a command is told otherwise, and a project without
one gets `recommended`:

```ts
// lint.config.ts
import { defineGuide, recommended } from "@webappwiz/lint";
import { NoFixme } from "./rules/no-fixme";

export default defineGuide([
	...recommended.filter((r) => r.id !== "classes-over-function-exports"),
	new NoFixme(),
]);
```

Your own rule is the same class and the same markdown import, wherever it
lives.

The recommended rules, each exported as its class so a guide can name one:

- `no-em-dashes` (checked): no em dashes in code, comments, or prose; an en
  dash survives only between digits, as a range.
- `one-class-per-file` (checked): a second top-level class wants its own
  file.
- `parameters-declare-fields` (checked): a constructor copying a parameter
  into a field of the same name should declare the field on the parameter.
- `classes-over-function-exports` (partially checked): several exported
  functions injecting dependencies should become a class; the check sees
  function-typed parameters, the agent judges interface-typed ones.
- `objects-over-callbacks` (partially checked): inject objects, not
  callbacks; the check sees function types in constructor parameters, the
  agent judges retained method parameters.
- `named-options-last` (partially checked): an options object goes last and
  its type is named; the check sees an options parameter that is neither, the
  agent judges parameters that should have been one.
- `tests-read-like-sentences` (partially checked): one describe per test
  file, titles completing "it ..."; the check counts the describes, the agent
  reads the titles.
- `simple-test-setup` (partially checked): a test file opens on what is
  tested; the check sees tests a loop generates, the agent judges the rest.
- `fakes-over-mocks`, `comments-say-why-not-what`,
  `doc-comments-address-users`, `one-dir-per-interface`: agent rules.

`tokens()` hands a check TypeScript's token stream (comment- and string-safe,
with line, column, and brace depth) when text alone is not enough.

## Ignoring a finding

The marker works from any comment syntax and the reason is required: without
one the marker excuses nothing.

```ts
// lint-ignore one-class-per-file: local fakes for this suite
```

A marker covers itself, the line under it, and everything indented under that
line, so above a declaration it covers the whole declaration.
`lint-ignore-file <id>: <reason>` covers the file instead. The linter and the
analysis agents honor the same markers.

## Linting

`wiz fix` runs the checks; standalone, `bunx @webappwiz/lint`. Every
git-tracked file a checked rule's glob wants is linted, reporting like a
compiler: `path:line:column rule message`. Errors fail the run; warnings only
print.

## Analyzing

`webappwiz lint analyze [dir]` checks the code against the guide's agent
rules, handing one rule at a time to an agent and printing what comes back as
lint output. Which agent is three flags, one of which you must pass:

```bash
webappwiz lint analyze --agent opus          # claude -p --model <haiku|sonnet|opus>
webappwiz lint analyze --exec "codex exec"   # any command, run by a shell
webappwiz lint analyze --prompt              # print the prompts, run nothing
```

There is no default: a run spends your tokens, so it will not choose for you
and exits with a usage error when given none of the three. `--exec` takes the
whole command, quoting and all, and is handed the prompt as one trailing
argument. `--prompt` is for an agent running the guide itself: it prints each
task's prompt under a `=== <id> <rule> (<n> files) ===` header, to hand to
subagents of its own.

`lint ls` lists the guide's rules, with which are checked and which cost an
agent; `lint show <id>` prints one in full.

## What a run costs

A run says what it is about to read before it reads any of it, and
`--estimate` prints that line and stops, spawning nothing:

```bash
webappwiz lint analyze --estimate
# checking 211 files against 7 rules in 52 agent calls, reading 641K+ tokens
```

Because it runs nothing, `--estimate` takes no `--agent`, `--exec` or
`--prompt`, and is not subject to `--budget`: being asked to approve a number
is what you run it instead of.

The number is the prompts plus every file they name, at four bytes to the
token. It is a floor, not a price. The same file is read once per rule whose
glob matches it, which is where a run's cost actually comes from: seven rules
over 360 KB of source is 2.4 MB of reading. On top of that each call pays for
the agent's own system prompt and for whatever it re-reads as it works,
neither of which is knowable from here.

Over `--budget` (200,000 tokens by default) the run asks before spending, and
answers itself with no on a terminal nobody is watching, so a scripted run
stops and says the number rather than hanging or quietly running up a bill.
Passing a budget the estimate fits under is how you say yes in advance.

`--since <ref>` checks only what git says was added or changed since that
ref, staged, unstaged or untracked alike, which is usually the cheaper
answer:

```bash
webappwiz lint analyze --since main --agent sonnet
```

Deletions are left out, since a violation quotes its line from disk and a
file that is gone has none. Rules that judge a directory's shape rather than
a file's contents get weaker under `--since`, because the files it hides are
still part of what they are meant to look at.

## Rules that do not need an agent

An agent is the last resort. It costs minutes and tokens every run and only
ever judges, so a rule a formatter, linter, type checker or grep could decide
outright belongs to a check instead. `lint audit`, with the same `--agent`
and `--exec` flags analyze takes, asks that question of every agent rule and
warns about the ones that answer with a tool:

```
no-fixme  warning  a linter could enforce this without an agent:
                   a regex for FIXME anywhere in a line
```

A tool only wins if it decides every case the rule covers, exceptions
included, so a rule a check would half-enforce stays with the agent, as a
`partial` check at most. The finding is a warning rather than an error
because writing the check is a judgment you make once, not something to fail
a build on by surprise: `--strict` is how you make it fail once you have
decided. Rules already carrying a full check are not asked about at all.

Audit also validates the guide itself, the way analyze does before running:
a rule whose document is broken is an error, printed before any agent spends
anything. There is no mode flag and no half of this to run on its own, so
audit does the same thing every time you call it:

```bash
webappwiz lint audit --agent sonnet
# sound: 8 rules, 0 errors, 0 warnings
```

A broken document stops the run before it spends anything, since a guide
that will not compile is not worth asking an agent about.

## API

Those commands are a thin shell over this package. `Guides` reads a guide
module and reports what is wrong with its rules, `load` for a named module and
`project` for the `lint.config.ts`-or-`recommended` default; `RuleDocument`
parses one rule's markdown, for a report that wants its title or its examples;
`Linter`
runs the checks over in-memory files and `Lint` over the git-tracked tree;
`Mechanizer` asks an agent which agent rules a tool could enforce instead,
and answers in the same `GuideDiagnostic` shape, so the two print as one
report; `Analyzer` plans one task per agent rule and chunk of matching files,
hands each to an agent, and returns what came back, calling you as each task
lands so a caller can print findings as they arrive. Rendering is the
caller's: a violation carries the rule's id and level, the file and line, the
message, and that line of source read from disk.

```ts
const { rules, diagnostics } = await new Guides(fs).project();
const analyzer = new Analyzer(log, fs, ps, clock);
const violations = await analyzer.analyze(
	rules.filter((r) => !r.check || r.partial),
	".",
	25,
	agentCommand({ agent: "sonnet" }),
	{ finished: (task) => console.log(task.id, task.violations.length) },
);
```

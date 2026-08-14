# @webappwiz/judge

Static analysis you write yourself, not a lint engine. There is no built-in
rule set, no severity matrix and no plugin protocol: there is one rule format,
and it covers the analysis an agent has to read code to do as well as the
analysis a token scan can decide. If your rule is a regex, biome or eslint
already run it faster; this is for the rules they cannot express.

The agent runner underneath is [`@webappwiz/rules`](../rules), which owns
concurrency, prompt assembly and the JSON contract. Everything file-shaped is
here: which files a rule applies to, how they are chunked, `judge-ignore`
markers, and quoting the offending line off disk.

A rule is a class beside its markdown: the class says what the rule applies to
and how, if at all, code alone decides it; the document says what the rule is,
to a human and to an agent, in `## Good` and `## Bad` examples.

```ts
// rule/one-class-per-file.ts
import doc from "./one-class-per-file.md" with { type: "text" };
import type { FileText, Rule, Verdict } from "./rule";

export class OneClassPerFile implements Rule {
	private static readonly MESSAGE =
		"more than one class in this file: give each its own file";

	readonly id = "one-class-per-file";
	readonly files = "**/*.ts";
	readonly level = "error";
	readonly document = doc;

	check({ text }: FileText): Verdict {
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

Every kind of rule is one method returning a verdict, `{ findings,
escalate? }`, rather than a type in a taxonomy:

| the check returns | what settles it | what it costs |
| --- | --- | --- |
| `{ findings }` | a token scan, outright | free, on every `wiz fix` |
| `{ findings, escalate: true }` | the check what it can see, an agent the rest | both |
| `{ findings: [], escalate: true }` | an agent reading the code | billed, on demand |

`escalate` is per file, so a rule can scan cheaply and send an agent only the
files its own judgment says are worth one. What a check finds is reported at
once; what it escalates is exactly what a paid run reads, and nothing else.

## The rule set

There is no config file. Rules reach judge as objects, so a rule set is a
constant beside the code that runs it, and composing one stays typed without a
module being imported at runtime to find out what is in it.

```ts
// rules.ts
import { defineJudge, NoEmDashes, OneClassPerFile } from "@webappwiz/judge";
import { NoFixme } from "./rules/no-fixme";

export const RULES = defineJudge({
	rules: [new NoEmDashes(), new OneClassPerFile(), new NoFixme()],
	agent: "haiku", // the model an agent run uses unless told otherwise
	concurrency: 4, // agent calls in flight at once
});
```

Hand that to `Check` for the local pass, or to `JudgeCommands` for the agent
one. There is no recommended set to fall back on and nothing runs implicitly:
a rule is in the list or it does not run. Your own rule is the same class and
the same markdown import, wherever it lives.

`agent` and `concurrency` are the two knobs a run has, and both have defaults:
`haiku`, because the rule and the file are in the prompt and the reading is
what a run is paying for, and 4 calls at once, which is about rate limits and
patience rather than this machine. `--agent` and `--exec` override the model
per run.

The rules this package ships, each exported as its class so a rule set can
name one:

- `no-em-dashes` (`code`): no em dashes in code, comments, or prose; an en
  dash survives only between digits, as a range.
- `one-class-per-file` (`code`): a second top-level class wants its own
  file.
- `parameters-declare-fields` (`code`): a constructor copying a parameter
  into a field of the same name should declare the field on the parameter.
- `classes-over-function-exports` (`code-then-agent`): several exported
  functions injecting dependencies should become a class; the check sees
  function-typed parameters, the agent judges interface-typed ones.
- `objects-over-callbacks` (`code-then-agent`): inject objects, not
  callbacks; the check sees function types in constructor parameters, the
  agent judges retained method parameters.
- `named-options-last` (`code-then-agent`): an options object goes last and
  its type is named; the check sees an options parameter that is neither, the
  agent judges parameters that should have been one.
- `simple-test-setup` (`code-then-agent`): one describe per test file, titles
  completing "it ...", setup behind `beforeEach` or a harness; the check
  counts the describes and sees tests a loop generates, the agent reads the
  titles and judges the setup.
- `fakes-over-mocks`, `comments-say-why-not-what`,
  `doc-comments-address-users`, `one-dir-per-interface`,
  `reactive-over-use-state`, `dev-servers-find-a-port`: `agent`.

`tokens()` hands a check TypeScript's token stream (comment- and string-safe,
with line, column, and brace depth) when text alone is not enough.

## Ignoring a finding

The marker works from any comment syntax and the reason is required: without
one the marker excuses nothing.

```ts
// judge-ignore one-class-per-file: local fakes for this suite
```

A marker covers itself, the line under it, and everything indented under that
line, so above a declaration it covers the whole declaration.
`judge-ignore-file <id>: <reason>` covers the file instead. Checks and agents
honor the same markers.

## Checking

`wiz fix` runs the checks, through `Check`. Every git-tracked file a checked
rule's glob wants is read, reporting like a compiler:
`path:line:column rule message`. Errors fail the run; warnings only print.
This package ships no binary of its own: what transport the checks run over is
the caller's to choose.

## Judging

`webappwiz judge [dir]` checks the code against the rule set's agent rules,
handing every rule that shares a glob to an agent in one task so the files are
read once rather than once per rule, and printing what comes back as one
report. Which agent is three flags, and the rule set answers when you pass none
of them:

```bash
webappwiz judge --agent opus          # claude -p --model <haiku|sonnet|opus>
webappwiz judge --exec "codex exec"   # any command, run by a shell
webappwiz judge --prompt              # print the prompts, run nothing
```

`--exec` takes the
whole command, quoting and all, and is handed the prompt as one trailing
argument. `--prompt` is for an agent running the rules itself: it prints each
task's prompt under a `=== <glob>: <ids> (<n> files) ===` header, to hand to
subagents of its own.

`rules ls` lists the rules, with which are checked and which cost an
agent; `rules show <id>` prints one in full.

## What a run costs

A run says what it is about to read before it reads any of it, and
`--estimate` prints that line and stops, spawning nothing:

```bash
webappwiz judge --estimate
# checking 211 files against 7 rules in 9 agent calls, reading 165K+ tokens
```

Because it runs nothing, `--estimate` takes no `--agent`, `--exec` or
`--prompt`, and is not subject to `--budget`: being asked to approve a number
is what you run it instead of.

The number is the prompts plus every file they name, at four bytes to the
token. It is a floor, not a price. Rules that share a glob share their tasks,
so a file is read once per distinct glob that matches it rather than once per
rule; the total is close to the size of the source, not a multiple of it. On
top of that each call pays for the agent's own system prompt and for whatever
it re-reads as it works, neither of which is knowable from here.

Over `--budget` (200,000 tokens by default) the run asks before spending, and
answers itself with no on a terminal nobody is watching, so a scripted run
stops and says the number rather than hanging or quietly running up a bill.
Passing a budget the estimate fits under is how you say yes in advance.

`--since <ref>` checks only what git says was added or changed since that
ref, staged, unstaged or untracked alike, which is usually the cheaper
answer:

```bash
webappwiz judge --since main --agent sonnet
```

Deletions are left out, since a violation quotes its line from disk and a
file that is gone has none. Rules that judge a directory's shape rather than
a file's contents get weaker under `--since`, because the files it hides are
still part of what they are meant to look at.

## Rules that do not need an agent

An agent is the last resort. It costs minutes and tokens every run and only
ever judges, so a rule a formatter, linter, type checker or grep could decide
outright belongs to a check instead. `rules audit`, with the same `--agent`
and `--exec` flags judge takes, asks that question of every agent rule and
warns about the ones that answer with a tool:

```
no-fixme  warning  a linter could enforce this without an agent:
                   a regex for FIXME anywhere in a line
```

A tool only wins if it decides every case the rule covers, exceptions
included, so a rule a check would half-enforce stays with the agent, its
check escalating what it cannot see. The finding is a warning rather than an
error
because writing the check is a judgment you make once, not something to fail
a build on by surprise: `--strict` is how you make it fail once you have
decided. Rules already carrying a full check are not asked about at all.

Audit also validates the rules themselves, the way judge does before running:
a rule whose document is broken is an error, printed before any agent spends
anything. There is no mode flag and no half of this to run on its own, so
audit does the same thing every time you call it:

```bash
webappwiz rules audit --agent sonnet
# sound: 8 rules, 0 errors, 0 warnings
```

A broken document stops the run before it spends anything, since a rule set
nobody can report against is not worth asking an agent about.

## API

Those commands are a thin shell over this package. `diagnose` reports what is
wrong with a rule set's own rules; `RuleDocument` parses one rule's markdown, for a report that wants
its title or its examples; `Checker`
runs the checks over in-memory files and `Check` over the git-tracked tree;
`Mechanizer` asks an agent which escalating rules a tool could enforce
instead, and answers in the same `ConfigDiagnostic` shape, so the two print
as one report; `Analyzer` runs every rule's check first, free, groups the
files they escalated into chunked tasks, hands each to an agent, and returns
what came back, calling you as each task lands so a caller can print findings
as they arrive. Rendering is the caller's: a violation carries the rule's id
and level, the file and line, the message, and that line of source read from
disk.

```ts
const config = RULES;
const analyzer = new Analyzer(log, fs, ps, clock);
analyzer.events.on("finished", (task) =>
	console.log(task.label, task.violations.length),
);
const violations = await analyzer.run(
	await analyzer.plan(config.rules, ".", { chunk: 25 }),
	".",
	agentCommand({ agent: config.agent }),
	config.concurrency,
);
```

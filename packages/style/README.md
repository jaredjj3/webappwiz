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

## API

Those commands are a thin shell over this package. `loadGuide` compiles a guide
module's rules and reports what is wrong with it; `Analyzer` plans one task per
rule and chunk of matching files, hands each to an agent, and returns what came
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

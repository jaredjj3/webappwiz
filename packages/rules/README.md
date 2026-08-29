# @webappwiz/rules

Checking code against rules an agent has to read to apply. It owns the parts a
command would otherwise rewrite: assembling a prompt from rule documents,
spawning the agent, keeping a bounded number of calls in flight, parsing
findings back out of whatever the agent wrapped them in, and choosing which
files to send in the first place.

It also owns webappwiz's own rules: a class and a markdown document each, all of
them in [`rules/`](./rules) and exported from `@webappwiz/rules/rules`. Nothing
here assembles them into a set. A caller names the rules it wants, as
[`@webappwiz/cli`](../cli/rules.ts) does in `JUDGE_RULES` and `SIGNOFF_RULES`,
hands the list in, and reads violations back.

## A rule

```ts
export interface Rule {
	readonly id: string;
	readonly document: string;
}

export interface FileRule extends Rule {
	readonly files: string;
	readonly level: Level;
	check(file: FileText): Verdict;
}
```

`Rule` is a rule nothing runs: an id and the markdown, which is the whole of a
document a reader applies themselves. `FileRule` is one a run checks files
against. Its verdict, `{ findings, escalate? }`, says what code settled and
whether an agent should read the file against the document too, so every kind
of rule is a return value rather than a type: code settles a file by returning
findings, an agent-judged rule returns `{ findings: [], escalate: true }`, and
a hybrid returns both.

## Running one

`Files` chooses the files and turns findings back into violations; `Harness`
makes the calls. A command holds both, and nothing wraps either:

```ts
const files = new Files({ log });
const tasks = await files.plan(rules, dir, { chunk: 25 });

const harness = new Harness({ log });
harness.events.on("finished", ({ at, findings }) => {
	const task = tasks[at];
	if (task) {
		print(files.violations(task, findings, dir));
	}
});
await harness.run(tasks, agentCommand({ agent: "haiku" }), { cwd: dir });
```

`plan` runs every rule's check first, free, and builds tasks from exactly what
those checks escalated, so the agent reads the files no check could settle and
nothing else. Rules escalating the same files ride in one task, because the
files are what a task costs. `violations` is sync, off what the plan already
read, so a task's findings print the moment its agent returns.

`Check` is the free half on its own, for a `fix` or a pre-commit hook: it runs
the checks over every git-tracked file a glob wants and never spawns anything.

## A task

One task is one agent call. The caller says which rules it applies and renders
the material they apply to; `prompt(task)` supplies the preamble, the rule
documents verbatim, and the output contract. `instructions` is where a caller's
own conventions go, so nothing here has to know about them.

## A finding

```ts
export interface Finding {
	rule: string;
	message: string;
	file?: string;
	line?: number;
	column?: number;
}
```

The location is optional because a rule about a whole change has nowhere to
point. The harness checks that a reported rule id is one the task was given and
says so on stderr when it is not, since a finding filed under a misspelled id is
still a finding somebody paid for. `Files` drops one naming a file its task was
never given, for the same reason and just as loudly.

## The agent

`--agent` names one of `haiku`, `sonnet` or `opus`; `--exec` hands the prompt
to a command of your own instead. `--output-format json` wraps a model run's
answer in an envelope the harness can read token usage out of, so an `--exec`
run reports no tokens rather than guessing them.

## No config file

There is none, and nothing here reads one. Rules arrive as objects, so a caller
keeps its rule set wherever it keeps code and picks its own transport: a CLI
flag, a constant beside the call, whatever suits. `defineRules` fills in the two
knobs every caller needs, `agent` and `concurrency`.

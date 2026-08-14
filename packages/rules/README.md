# @webappwiz/rules

The harness underneath a command that judges code against rules an agent has
to read to apply. It owns the parts every such command needs and would
otherwise rewrite: assembling a prompt from rule documents, spawning the
agent, keeping a bounded number of calls in flight, and parsing findings back
out of whatever the agent wrapped them in.

It owns nothing else. It never walks a tree, matches a glob, reads a diff or
decides what a finding means. A caller hands it tasks and reads findings back;
what those findings are worth is the caller's question to answer.

[`@webappwiz/judge`](../judge) is one caller, checking files against style
rules. A second is coming for merge signoff, which judges a changeset rather
than a tree and answers with a decision rather than a report. They share this
and no code at all otherwise, which is the point.

## A rule

```ts
export interface Rule<Unit, F = Finding> {
	readonly id: string;
	readonly document: string;
	check(unit: Unit): Verdict<F>;
}
```

A unit is whatever one check reads and one finding cites: judge's is one
file, signoff's the whole changeset. The check is the whole of a rule's code
half, and its verdict, `{ findings, escalate? }`, says what code settled and
whether an agent should read the unit against the document too. A task only
carries `id` and `document`; which units a rule applies to and how loudly it
reports vary by caller, so callers extend this with what they need and keep
it to themselves.

## A task

One task is one agent call. The caller says which rules it applies and renders
the material they apply to; the harness supplies the preamble, the rule
documents verbatim, and the output contract.

```ts
const findings = await harness.run(
	[
		{
			rules: [new NoFixme()],
			context: "Check each of these files:\n\n- src/a.ts",
			instructions: "Honor judge-ignore markers.",
			label: "**/*.ts",
		},
	],
	agentCommand({ agent: "haiku" }),
	{ cwd: "/repo", concurrency: 4 },
);
```

`instructions` is where a caller's own conventions go, so the harness does not
have to know about them. `events.on("finished", ...)` fires per task the
moment its agent returns, for a caller printing findings as they land rather
than waiting for the slowest call.

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
point. The harness checks that a reported rule id is one the task was given
and says so on stderr when it is not, since a finding filed under a misspelled
id is still a finding somebody paid for.

## The agent

`--agent` names one of `haiku`, `sonnet` or `opus`; `--exec` hands the prompt
to a command of your own instead. `--output-format json` is how a model run
reports what it was billed, which is the only place a real dollar figure comes
from, so an `--exec` run reports no money rather than guessing it.

## No config file

There is none, and the harness reads none. Rules arrive as objects on a task,
so a caller keeps its rule set wherever it keeps code, and picks its own
transport: a CLI flag, a constant beside the call, whatever suits. What the
harness does own is the two knobs every caller needs, `agent` and
`concurrency`, as `RunnerOptions` for a caller's own rule set type to extend.

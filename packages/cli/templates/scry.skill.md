---
name: scry
description: "Scry a change: review it against the rules in this project's .wiz/rules directory, by planning the work and handing it to parallel agents on the cheapest model that can judge it. Also adds, updates, and removes those rules. Use when the project has a .wiz/rules directory and the user asks to scry, to run, check, or apply the rules (the wiz rules, the webappwiz rules) to a change, or to write, change, or delete a rule there. Not for a general code review, a pull request review, a security review, or any review that does not name the rules."
version: 0.0.19
---

# Scrying a change

A rule is a directory under `.wiz/rules`, tracked in version control with the
code it governs:

```
.wiz/rules/<id>/
├── RULE.md        # required: what the rule wants, in prose an agent judges by
├── scripts/       # optional: helpers that do the mechanical part
└── references/    # optional: anything longer the rule points to
```

`RULE.md` opens with frontmatter. `name` (its directory) and `description`
(one line) are required. `files`, a glob of the files it applies to
(everything when absent), and `level`, `error` or `warning` (`error` when
absent), are hints. The body is free-form. It only has to say enough that an
agent who reads nothing else knows what counts and what does not; good and
bad examples do that best.

Code excuses itself from a rule with a comment holding
`scry-ignore <id>: <reason>`, which covers the statement under it, or
`scry-ignore-file <id>: <reason>`, which covers the whole file.

Before scry, these comments were `rule-ignore` and `rule-ignore-file`. Honor
the old spelling the same way, but it needs migrating: when a review's files
hold any, say so under the report's findings and offer to rename every
`rule-ignore` in the repository to `scry-ignore`. The rename changes nothing
else, so it needs no agent.

`bunx @webappwiz/cli rules <command>` keeps the rules that ship in the
`@webappwiz/rules` catalog: `list`, `add <id>`, `add --recommended`, `update`.
`rules --help` says the rest.

## Reviewing

1. **Make sure the work is finished** and its tests pass. A review is the last
   step, not a way to find out what to build.
2. **Scope the change with version control.** Use jj when `jj root` succeeds,
   git otherwise. Review what the user names. When they name nothing, review
   the uncommitted work if there is any, and otherwise the branch against
   trunk from their merge base. Deleted files are out of scope. Everything
   below reads only the changed files, and the diff says which lines changed.
3. **Plan from the frontmatter alone.** Read only the frontmatter of every
   `RULE.md` (`sed -n '1,/^---$/p'` on each prints it), and match each rule's
   `files` glob against the changed files. Do not read a rule's body. The
   bodies are for the agents who judge them; once they sit in your context
   you start reasoning about style instead of running the review, and every
   rule you read is paid for twice.
4. **Divide the work** however suits this change (see below), and write the
   plan down: the scope, each agent's rules and files, its model, and the
   scripts it will run.
5. **Check the cost** (see below). A small plan runs; an expensive one waits
   for the user to approve or cut it.
6. **Run every agent at once**, through whatever this harness offers for
   parallel work: subagents, background tasks, a workflow. Each gets the
   prompt below and nothing else. Never judge a rule yourself, and where
   nothing runs in parallel, still send the agents one at a time rather than
   doing their work.
7. **Collect the replies.** A reply that is not a JSON array gets one rerun,
   then goes in the report as not reviewed rather than guessed at.
8. **Report, then stop** and ask which findings to act on.

### Dividing the work

The split is yours to choose, within these constraints:

- **Every agent reads each of its files once.** Give one agent the rules that
  match the same files, so it judges each file against all of them in one
  reading, rather than one agent a rule.
- **Keep each agent's load small enough to read carefully.** An agent holding
  too many rules or too many files skims, and a finding it skims past is
  never reported. A few dozen rule-file pairs is plenty for rules a grep
  settles; a rule that takes design judgment across a whole file deserves an
  agent of its own, or close to it.
- **Group by difficulty** so each agent can run on the cheapest model that
  can judge its rules. Judge difficulty from the description: a rule a grep,
  a count, or its script settles goes to the smallest, fastest model; a rule
  that weighs design across a file goes to the strongest; the rest take the
  harness default. Ignore models when the harness does not let you choose.
- **More agents is not better.** Each one pays to read its rules and its
  files, so do not split a group that one agent can hold.

### The cost

Proceed without asking when the plan is small: about five agents or fewer,
a diff of a few hundred changed lines, and no single file so large an agent
cannot read it whole. Anything past that, stop before starting a single
agent. Print the plan, say how many agents at which models it starts at
once, and ask how to proceed. Offer the ways to shrink it:

- Measure from a nearer ref, or review only the uncommitted work.
- Review only the paths the user cares about, and name the rest as not
  reviewed in the report.
- Run only some rules, such as the errors.
- Fewer, larger groups: fewer agents, each reading less carefully.

Take a plan the user agrees to, not one that merely gets under the bar.

Say so in the plan, too, when it runs scripts the user may not have read:
the repository came from someone else, or `rules update` changed them since
they last looked.

### The prompt

Give every agent exactly this, filled in:

````
Review a change against these rules. Read each rule's file in full first:

- `.wiz/rules/<id>/RULE.md` (level <level>)
- ...

Judge these files, as changed since <ref>; `<diff command> -- <file>` shows
what changed. Judge the changed lines in the context of the whole file:

- `<file>`
- ...

Where a rule's directory has a `scripts/` directory and its RULE.md says how
to run a script, run it on the files above that the rule applies to. Each
line it prints, `file:line: message`, is a candidate: judge it against the
rule before reporting it, and look past it for what a script cannot see.

A comment holding `scry-ignore <rule>: <reason>` excuses the statement
under it from that rule, and `scry-ignore-file <rule>: <reason>`
excuses the whole file. The older `rule-ignore` and `rule-ignore-file` count
the same.

Read only. Change no file, and run no command that changes version control
state or runs across the repository.

Reply with a JSON array and nothing else, one object a finding:
{"rule": "<id>", "file": "<path>", "line": <n>, "message": "<what is wrong>", "script": <true when a script raised it>, "fix": {"old": "<exact text>", "new": "<replacement>"}}
Give a fix only when it is local and you are sure of it: `old` is a few whole
lines copied exactly from the file, enough to appear there once, and `new`
is what they become. Leave `fix` out when the fix takes judgment beyond a
few lines. Reply [] when nothing breaks these rules.
````

## The report

Write the report to a file named for the moment the review finished,
`.wiz/reviews/2026-09-04-143251.md` (`YYYY-MM-DD-HHMMSS`, local time), so a
listing sorts oldest first and two reviews never collide. Print the same
report in your reply, with the path.

Keep `.wiz/reviews` out of version control. Before writing the first report,
check (`git check-ignore -q .wiz/reviews`, or jj's equivalent), and when it is
not ignored, add it to `.gitignore` under a comment saying what it holds. A
report is one session's reading of one change: it is stale the moment the
change lands, and tracked, it turns up in every diff.

It opens with a line saying what the review covered and what it cost. Then
the findings, grouped by file and laid out the way a linter lays them out:
the file as a heading, then one line a finding, its number, the line number,
the level with its emoji (🛑 error, ⚠️ warning), the message, the rule, and
`✎` when a fix is ready, padded into columns by eye. Number the findings F1,
F2, and so on through the whole report, so the user can answer by number. A
finding a script raised carries `(script)` after its rule, so a mechanical
finding reads differently from a judged one.

````markdown
# Review 2026-09-04 14:32:51

9 files changed since main; 12 rules applied by 4 agents (2 haiku, 2 sonnet); 3 scripts run.

## Findings

### packages/cli/rules/list.ts

```
  F1  42  🛑 error    the export sits below two helpers     export-leads-the-file
  F2  87  ⚠️ warning  the comment restates the next line    comments-say-why-not-what  ✎
```

### packages/cli/skills/add.ts

```
  F3  13  🛑 error    a console.log left in                 no-console-log (script)    ✎
```

🛑 3 problems (2 errors, 1 warning), 2 with fixes ready

## Suggested fixes

### F2 packages/cli/rules/list.ts:87

```diff
-	// loop over the rows
 	for (const row of rows) {
```

### F3 packages/cli/skills/add.ts:13

```diff
-	console.log(opts);
 	const documents = new Documents(opts.skills ?? bundled, SKILLS, opts);
```
````

A file no rule found anything in does not appear. A review that found
nothing says `✅ No findings.` in place of the tally and still gets its file:
a record that the rules ran and were quiet is worth keeping. Anything the
review did not cover goes under `## Not reviewed`, each with its rules, its
files, and why: the agent never answered, or the user cut it from the plan.

## Acting on the findings

End your reply by asking what to do with them, in as many words: which to
apply, by number, `all`, `errors`, or `none`, and which are wrong. Then wait.
Nothing changes until the user answers, and an answer to some other question
is not an answer to this one.

### Applying a fix

Apply each accepted finding that has a fix yourself, as the exact
replacement the reviewer gave. Read only the lines around it, if the harness
makes you read before editing; the reviewer already read the rule and the
file, and paying for them again is what the fix saves. When `old` no longer
appears exactly once, because an earlier fix touched the same lines or the
file moved on, skip it and say so rather than guessing. Then say which
findings changed, and suggest the project's own check or test command.

### Findings without a fix

An accepted finding with no fix takes judgment, so it takes an agent: one a
file, holding every such finding in it, since two findings in one file are
usually one piece of work, and separate agents revert each other's fixes
without knowing it. Say how many agents that is before starting them, and
start them all at once, each in a worktree of its own, each given this and
nothing else:

```
Read `.wiz/rules/<id>/RULE.md` for each rule named below. In `<file>`:
- line <line>: <message> (rule <id>)
Change the code so it follows those rules, touching as little as you can.
```

The agents are writing, so the work has to come back to you. Where the
project has a way to land an agent's branch, have it commit and use that;
otherwise have it reply with its diff and apply that yourself. Either way,
look at the files before reporting what changed: an agent whose work was
lost still says it succeeded.

A worktree each is not optional. Agents sharing a tree do not collide by
editing one file; one runs the project's fix or test command, which rewrites
or fails on files another agent is halfway through, and reaches for
`git stash` or `git checkout --` to clean up what it takes for its own mess.
Where the harness cannot give an agent its own tree, say in its prompt: no
command that changes version control state, and nothing run repo-wide.

### A finding that is wrong

When the user says a finding is wrong, offer to keep it from coming back.
When the code is right for a reason the rule does not know, add a
`scry-ignore <id>: <reason>` comment with their reason. When the rule itself
misled the reviewer, offer to tighten its prose or examples (see Updating a
rule), which is the one time this flow reads a rule.

## Managing rules

Writing, changing, or removing a rule is the one time you read one, and only
the one in hand.

### Adding a rule

1. Find out what the rule wants: what counts, what does not, and an example
   of each. Ask for what the user has not said.
2. **Check whether the project's own tooling can enforce it** before writing
   anything. Find out what the project actually runs, from its manifests and
   lockfiles, its linter, formatter, and compiler configuration, its
   pre-commit hooks, its CI workflows, and its own check scripts, and
   consider only those tools. When one of them can express the rule, say so,
   show the configuration you would add, and ask whether to do that instead
   of the rule, or as well. A linter checks every file on every run for
   nothing; a rule costs an agent each review. When nothing the project
   already runs fits, say that, and do not propose adopting a new tool unless
   asked.
3. When a shipped rule covers it, `rules add <id>` copies it in, and it can be
   edited from there. Otherwise write `.wiz/rules/<id>/RULE.md`: the
   frontmatter above, then the prose and examples. Pick an id that says what
   the rule wants, in kebab case.
4. Offer a script when part of the rule is mechanical (see Scripts).
5. Run `rules list`, which validates the frontmatter of every rule and names
   the line that is wrong.

### Updating a rule

Edit it, and check the project's tooling again when what it asks changes.
Keep its examples in step with its prose. A rule copied from the catalog
takes local edits, but `rules update` overwrites them; say so before editing
one that carries a `version`, and offer to drop the `version` line so the
copy becomes the project's own.

### Removing a rule

Confirm with the user, then delete its directory, scripts and all.

### Scripts

A script does the part of a rule a program can settle, so the agent judging
it starts from a short list of candidates. It need not settle the rule; a
list of places worth a look is enough. The contract:

- It lives in `.wiz/rules/<id>/scripts/`, and the rule's `RULE.md` says how
  to run it.
- It takes the files to check as arguments.
- It prints one candidate a line, `file:line: message`, and exits 0 whether
  it found anything or not.
- It reads and never writes.

Write it in whatever the project already runs, so it needs nothing new
installed.

**Every new or changed script needs the user's approval before it is
saved.** Show the whole script, or the whole diff, and say plainly that it
runs on every future review, on whatever machine runs one, so it deserves the
same line-by-line reading as any code about to execute. Strongly encourage
them to read it, then wait for a yes. The same goes for scripts that arrive
from elsewhere: when `rules add` or `rules update` reports a script, pass its
warning on and ask the user to read it before the next review.

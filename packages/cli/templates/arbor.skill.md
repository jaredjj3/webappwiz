---
name: arbor
description: Use the @webappwiz/arbor CLI to land your work on trunk, or a base branch given as an argument, from an isolated git worktree without pull requests. Read this before investigating anything that may lead to a code change in an arbor repository, since it decides where the work happens, and whenever you need to add, claim, merge, remove, list, show, locate, escalate, or defer a task, or add, pick up, or reorder a todo.
version: 0.0.31
---

# Using arbor

`arbor` runs many agents on one repo, each in its own git worktree, landing on
trunk without pull requests. Run it with `bunx @webappwiz/arbor <command>` (or
`arbor` if on PATH). `arbor --help` explains the commands; this file covers
only what the CLI cannot tell you.

**Rule:** never use raw git for state transitions arbor covers. Every landing
goes through `arbor merge`. The exception is finishing an in-progress rebase
(`git add`, `git rebase --continue`), then merging again.

A failed command prints `{reason}` JSON on stdout and instructions on stderr:
do what stderr says. Memorize one: exit 4 `lease_lost` means stop, do not
retry, another agent owns the tree.

## Workflow

1. **Start before you look.** When a request may end in a code change,
   `arbor add <task>` before reading any code, and investigate in its
   worktree: the main tree changes under you as other tasks land, a worktree
   does not. A question that only needs an answer stays in the main tree.
   `arbor claim <task>` resumes a task instead. When the request is a todo,
   take it now, `arbor add <task> --todo <id>`, so no other agent starts on
   it. Pass `--base <branch>` only when invoked with a branch
   (`/arbor feature/auth`) or the user names one; never guess a base from
   the checked-out branch.
2. **Plan.** Once you know what done means, fill in the `ARBOR.md` stub
   before touching code (see below). Then groom the todos your work
   touches: find them by tag and claim every one you can (see Grooming
   related todos).
3. **Check for overlap.** Compare your `## Files` with `arbor list --files`.
   Some overlap is normal: work alongside and accept the rebase, noting it
   in `ARBOR.md`. Only when conflicts would be hard to resolve,
   `arbor wait <task>` for the other task to land first. If it is doing the
   opposite of what you were asked, escalate instead.
4. **Work.** Commit with git as you go; arbor never commits for you. Defer
   anything outside your Goal with `arbor todo add "<subject>"` and move on.
   Ask about any call the request does not settle as you make it, and keep
   going (see Asking as you go). Before each step, bring `## Blocked` up to
   date (see Keeping Blocked current).
5. **Groom again and settle todos** (see Grooming related todos), **squash** to one commit (see
   Committing), then **`arbor merge`**. On failure, do what stderr says and
   merge again.

A successful merge deletes the worktree and your working directory with it:
`cd` to the main tree it prints before running anything else.

**Clean up every task you start.** A task ends in a merge or a remove, never
left behind. When investigating shows there is nothing to change, the work
is moot, or it is better redone against current trunk, remove it:
`arbor todo remove` each todo it holds that is done or moot, `arbor todo
update` the rest with what you learned, then `cd "$(arbor path)"` to the
main tree and `arbor remove <task>`, which puts its remaining todos back on
the list. Report it as removed (see Reporting). A task escalated and waiting
on the user is not done: leave it for `arbor claim`.

`wait` ends on `removed` (landed or dropped: redo the overlap check),
`escalated` (the other task needs the user: tell them you are blocked on
it), a broken status (`wait` once more, then ask), or exit 14 `timeout` (wait
again or work alongside). A `stale` lease on a `working` task is normal: watch
status, never the lease.

## Todos

Todos are work deferred for later, shared by every task. Each has an id that
never changes, a one-line subject, optional detail, and a position: its
priority, 1 at the top of the list.

Write a subject the way you write a question's, short enough to scan:
`arbor todo add "Upload retries forever on a 413"`. Put the why, the where,
and anything else in the detail, written as markdown: the `arbor dev` page
renders it. Use paragraphs, lists, `- [ ]` steps, inline code for paths and
commands, and fenced blocks for snippets. Single quotes keep the shell off
the backticks:

```sh
arbor todo add "Upload retries forever on a 413" 'The client retries on any 4xx in `src/upload.ts`.

- [ ] stop retrying on 413
- [ ] tell the user the file is too big'
```

- `arbor todo list` shows them in position order, `--open` only those no
  task has taken, and `--tag uploads,merge` only those with any of those
  tags; `arbor todo show
  <id>` prints one whole, detail and attached files included.
- `arbor todo add "<subject>" ["<detail>"]` from your worktree records the
  task it came up in. It goes to the bottom unless you pass `--position <n>`
  (see Positions). `--file a.png,b.log` attaches files, `--tag uploads,merge`
  tags it.
- `arbor todo update <id> ["<detail>"] --subject "<subject>"` rewords one,
  `--position <n>` moves it, `--file` and `--remove-file` change its files,
  `--tag` and `--remove-tag` its tags.
- `arbor todo tags` lists every tag in use, with how many todos have it.
- `arbor todo take <id>` makes it part of your task; `arbor todo release <id>`
  puts it back; `arbor todo remove <id>` drops one that is done or moot.

A tag names the area or goal a todo belongs to, so related todos group
together and the `arbor dev` page can filter by it. A todo can
have several tags, and a tag many todos:

- Reuse before inventing: read `arbor todo tags` and take a tag from it
  whenever one fits.
- One lowercase word, like `uploads` or `merge`; when one word cannot say
  it, join a few with hyphens, like `dark-mode`. arbor refuses anything else.
- Name the part of the product or the goal the todos add up to, never the
  kind of work (`bug`, `refactor`), a task, a person, a priority, or a status:
  the subject, position, and taken-by already say those.
- One or two tags a todo, or none when nothing groups it.
- A todo that comes up in your task usually belongs with the todos your task
  holds: give it their tags when it does.

### Positions

Only the user's priorities decide a position, so the bottom of the list is
right unless the user says otherwise. Listen for how they say it when they
ask for a todo:

- "urgent", "next", "before anything else": `--position 1`.
- "fast follow", "right after this", "soon": near the top, just below the
  todos already there that are urgent. Read `arbor todo list` to find the
  spot.
- "deferred", "someday", "later", "nice to have", or nothing at all: the
  bottom, the default.

When the user asks to move a todo that already exists ("bump 12", "push the
upload one down", "do 7 before 4"), `arbor todo update <id> --position <n>`.
It moves the rest around it, and a position past the bottom puts it last.
Read `arbor todo list` first to turn "before 4" or "to the top" into a
number, and again after to check the order is the one asked for.

`[ARBOR TODO #N]` in a message means todo N, copied from the `arbor dev`
page: run `arbor todo show N` and treat it as the request. Take it before
you investigate: `arbor add <task> --todo N`, or `arbor todo take N` from a
task already under way. If `show` names another task that took it, tell the
user rather than start on it.

When something comes up that is not your Goal (a bug next door, a follow-up,
a reply that widens the task), `arbor todo add` it from your worktree and keep
going. Do not grow the task past one coherent change; claiming related todos
that fit inside it is grooming, not growth (see Grooming related todos).

A task can hold any number of todos, and merging removes every one it holds.
When an open todo turns out to be part of your work, `arbor todo take <id>`
from your worktree and add it to your Goal. For one you hold but only partly
did, `arbor todo update <id>` with what is left, then `arbor todo release
<id>`, so it stays on the list.

### Grooming related todos

Your work reaches past the todos you hold. Todos sharing their tags are
about the same area, and your change can settle them, shrink them, move what
they point at, or make them wrong. You hold the context that makes each one
cheap right now, so groom them while you have it, and claim every one you
can. Do it once you have planned, and again just before merging, since your
change has grown since.

1. **Gather the tags.** Collect the tags of every todo your task holds
   (`arbor todo show <id>`). When it holds none, take the ones from
   `arbor todo tags` that name the area of your Goal.
2. **List the related todos.** `arbor todo list --tag <tag>,<tag>` with all
   of them at once. Leave off `--open`: one another task has taken can
   still be affected by yours. `arbor todo show` each one your work might
   touch.
3. **Act on each one**, in this order of preference:
   - **Claim it** when it is open and your change settles it, makes it
     moot, or would settle it with a little more work in the same files:
     `arbor todo take <id>` and add it to your Goal. Claiming beats leaving
     it, because the next agent would rebuild the context you have now. The
     limit is the task staying one coherent change (see Committing); past
     that, leave it.
   - **Update it** when your change alters it but does not settle it (a
     path moved, a step is done, the approach no longer fits):
     `arbor todo update <id>` with what changed, ticking off the `- [ ]`
     steps you did.
   - **Retag it** when it turns out to belong to another area:
     `--tag` and `--remove-tag`.
   - **Coordinate** when another task has taken it and your change affects
     it: never take it, compare files with `arbor list --files` (see
     Workflow), and note it in `ARBOR.md`.
4. **Tag what you add.** A todo that comes up in your task gets the tags
   of the todos your task holds when it belongs with them, so the next
   grooming finds it.

Whenever a task ends, merged or removed, always find the next todo, so the
context this conversation built up gets used before it is gone. Read
`arbor todo list --open`, never picking one another task has taken, and take
the todo most relevant to the work you just did (the same files, feature, or
problem; `arbor todo show` one to be sure), preferring one that came up in
the task that just ended, then one sharing a tag with the todos it held
(`arbor todo list --open --tag <tag>,<tag>` with all their tags at once). Among equally relevant ones, and when
none is related, take the lowest position, the top of the list. `merge`
recommends the landed task's own todos first, then those sharing a tag with
the todos it settled, then the lowest position; `remove` recommends nothing,
so do this yourself. Propose it in your report (see Reporting), and after a
merge, also propose the next one or two in the same order when they are as
relevant, so the user can choose. One is enough when nothing else is
related.

### Proposing a todo

Whenever you put a todo in front of the user in chat, whether one you suggest
working on next or one you just added, write it the same way: a heading with
📝, its subject, and its id, then two sentences. The first says what the todo
is; the second says why it matters now, such as what it shares with the work
just done.

```markdown
### 📝 Upload retries forever on a 413 [#12]

The client retries every 4xx in `src/upload.ts`, so an oversized file never
fails. It touches the retry loop this task just rewrote.
```

Use the subject exactly as `arbor todo show` prints it, so the user can find
it on the `arbor dev` page. The 📝 belongs to the heading, never to the
subject: leave it out of `arbor todo add` and `--subject`. The heading sits
one level below the report's title.

## Handing out part of your task

`arbor add <part> --base task/<your task>` from inside your tree makes a task
that lands on your branch instead of trunk. While parts are out, keep your
tree committed (a part lands by fast-forwarding your checkout), re-read files
before editing them, and squash only after every part has landed. Hand a
part out only when describing it is shorter than doing it.

## Asking as you go

Do not save questions for escalation. Whenever you make a decision that does
not clearly follow from what the user asked (a name, a default, behavior they
never mentioned, one reading of an ambiguous ask), write a question under
`## Blocked` in `ARBOR.md` right away, in the format under Escalation, saying
what you chose and what else you could have done. Then move on to the rest of
the request without waiting. The user can answer in chat while you work, and
sees every open question in your report once you escalate. When an answer
overturns a choice, redo that part.

`arbor merge` refuses while a question is unchecked: when everything else is
done and some are still open, escalate and wait for them (see Escalation).

## Keeping Blocked current

`## Blocked` is what the user sees and answers, so it must say what you need
right now. Before you continue with any work (after the user replies, after
`arbor claim` returns, and between steps), bring it up to date:

- write every answer the user gave after `→` on its question's line;
- check off each question you have acted on;
- check off any that no longer applies, with why after `→`
  (`→ moot: the header was removed`), rather than deleting it;
- retake each screenshot an open question shows once your work has changed
  what it shows;
- add each question you now need, numbered after the highest.

Only then go on.

## Escalation

Merge only work you verified yourself. Escalate when verification needs the
user (external services, destructive migrations, visual changes), when the
user asked to see the work first, or, absent instructions, when the change is
complex enough that correctness needs a reader rather than a test.

1. `arbor escalate <reason>`. When the only thing left is the user's
   approval, `arbor escalate --review "<what to look at>"` instead: it asks
   `Ready to merge?` for you. Settle every other question first; it
   refuses while one is unchecked.
2. Leave something to look at, by **absolute path** (start from
   `arbor path <task>`): a screenshot for anything visual. Ask first if
   producing it is expensive.
3. Write each question not already there under `## Blocked` in `ARBOR.md`,
   then report.
4. End your turn and wait for the user to answer in chat. Do not run
   `arbor wait` or poll `ARBOR.md` for answers: they only come in chat.

Number questions 1, 2, … in the order you ask them; numbers never change,
and new ones continue from the highest. They are `ARBOR.md`'s, not the
user's: reports number questions afresh (see Reporting). A question's
line is its subject: short enough to scan in a list, and ending in the
question.
Everything else goes in lines indented under it, which render as markdown:
detail, code blocks, and screenshots as `![what](/abs/path.png)`. Ask for what is wrong rather than a bare yes or no. When
the answer is one of a few, list `- (a) ...` lines last (pick one, or none);
for "all that apply", `- [a] ...` lines. A reply names its picks spelled out
(`a (Email), c (Push)`), may add words after a colon, or may answer in words
alone.

````markdown
## Blocked

- [x] 1. Do the live tests pass against staging? → yes
- [ ] 2. Does the header wrap to two lines?
  ![header at 390px](/abs/path/shot.png)
- [ ] 3. How should existing sessions move to the new tokens?
  Sessions are keyed by the old cookie:

  ```ts
  const session = await sessions.find(cookie);
  ```

  - (a) Sign everyone out once
  - (b) Migrate each session on its next request
````

Answers arrive in chat; write each one into `ARBOR.md` after `→` yourself.
The user answers a report with a markdown list matching its numbers: `2.` means the
second question in your latest report, whatever number it has in `ARBOR.md`.
Items left out stay open. When a reply does not fit your latest report, ask
rather than guess. A conversation can answer a question without naming it:
whenever anything the user says settles an open question, write that answer
after `→` and check it off, so it is not asked again. Check an item off only when the answer is one you can act on;
anything else stays open and leads your next report. A reply about something
you did is an instruction. A reply to defer or skip a question means leave it
out and carry on (for a defer, `arbor todo add` it first): check the item
off. An approval answers a review: check it off and merge. `arbor merge` refuses with exit 16 `blocked` while
`## Blocked` has an unchecked item. `arbor claim` resumes an escalated task.
`arbor retry` is only for `budget_exhausted`, and is the user's to run,
before you claim.

## Follow-ups

The user can follow up any answer in chat, even one you checked off. Write
the follow-up on a `→ ` line of its own under its question
and uncheck it. Treat it as an instruction from the user: act on it, then
check the question off again. You never answer questions, yours or
another agent's: say what you need in your report or under `## Blocked`.

## Reporting

However a task ends, say so in one block: a `##` title, a blank line, and one
plain sentence on what changed. The title is the emoji, the outcome, and the
bare task name, then what matters most about the ending: the base for a
merge, otherwise what it waits on or why it went, after a colon. That part
leads with what it needs from the user (a review, a decision, access, a test
only they can run), not the work done, which is the sentence's job. Keep the
title to about eight words, lowercase after the colon, with no ending
punctuation.

```markdown
## ✅ Merged <task> onto <base>

One sentence on what changed.

Stale: todo <id> (remove?).

### 📝 <subject> [#<id>]

What the todo is. Why it is a good next step.

### 📝 <subject> [#<id>]

What the todo is. Why it is a good next step.
```

The proposed todos end a merge or remove report, the best one first, each in
the format under Proposing a todo. Leave them out only when no todo is open.

```markdown
## ⚠️ Escalated <task>: waiting on your review of the todo board

One sentence on what changed.

1. Does dragging a card feel right on a phone?
   Press and hold a card, then drag it.
   ![dragging a card](/abs/path/drag.png)
2. How should a stale todo be shown?
   - (a) A muted card
   - (b) A "stale" badge
3. Ready to merge?
   Drag a todo at http://localhost:4269
```

An escalation lists every open question as a markdown list numbered from 1,
the questions left open from earlier reports first, and that list ends the
report: anything else worth saying goes between the sentence and the list.
Every question you need answered is an item in it, never a question asked in
prose, so the user can answer each one by its number. Chat is the only place
the user reads them, so each item carries everything needed to answer it.
The item's line is the question's subject. Indented under
it goes whatever the answer depends on: the body cut to a line or two,
choices exactly as in `ARBOR.md` (`- (a) ...` or `- [a] ...`, so a reply of
`2. b` names one), and each screenshot or file by its absolute path. Inline a
screenshot as `![what](/abs/path.png)` when your harness shows images in
chat; otherwise link it as `[what](/abs/path.png)`. A screenshot shows the
work as it is now: whenever you change what one shows, take it again before
the next report, and point the question in `ARBOR.md` at it. A review's lines say what
to look at and where. Leave an item bare when its
subject says it all.

```markdown
## 🛑 Removed <task>: superseded by a fix on main

One sentence on what the task set out to do.

### 📝 <subject> [#<id>]

What the todo is. Why it is a good next step.
```

For a merge or a remove, anything else worth saying goes between the sentence
and the proposed todos, not instead of them. An escalation's questions always
come last.

## ARBOR.md

Your session can die at any moment; `ARBOR.md` is what lets a stranger
`arbor claim` the task and continue. Size it to the task: a few lines for a
small change, a full record for a long one.

````markdown
# <task>

## Goal

One or two lines on what done means.

## Files

- every/path/you/plan/to/touch.ts

## Done

- [x] finished steps: the only progress the task reports

## Next

- [ ] every step you can foresee, roughly one commit each

## Notes

Decisions, dead ends, and how to verify.
````

Keep it current as you go, not at the end: move steps to `## Done` as they
land and keep `## Files` matching what you touch, since `arbor list --files`
shows it to other agents. Run `arbor show <task>` after writing it to check
the shape. It is excluded from git: never commit it or mention it in a commit
message.

## Committing

Plain, human-style messages with **no attribution**: no `Co-authored-by:`,
no "Generated with", no agent or model names, no `--author`. Commit as often
as helps; wanting many more than 5 commits means the task wants splitting.

Before `arbor merge`, squash to one commit describing the net change, what
the base gains, not the path you took:

```sh
git reset --soft "$(git merge-base <base> HEAD)" && git commit -m "<message>"
```

`<base>` is what `arbor show <task>` prints: trunk unless the task was created
with `--base`.

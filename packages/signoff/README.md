# @webappwiz/signoff

Decides whether a change can land on its own, or whether it needs a person
first. Rules in, one decision out.

It is not a linter and not a code review. It asks a narrower question: is
anything here beyond what an agent should land unwatched? A change that ships
may still be wrong, and a change that needs review may be perfectly fine. The
rules encode where your appetite for being surprised runs out.

The agent runner underneath is [`@webappwiz/rules`](../rules). What is here is
the changeset, the rules that read it, and the decision.

```ts
const changeset = await new GitChanges(ps, fs).since("main");
const { ships, reasons } = new Signoff([new TestsNotWeakened()]).check(changeset);
```

There is no default rule set and no config file. The rules are the caller's,
passed in: a gate nobody chose is a gate nobody trusts. One reason is enough
to stop a change, so a rule reporting nothing is a rule with no objection
rather than a rule voting to ship.

## The changeset

Everything the tree has changed since a ref: which files, what happened to
each, and the lines each one gained.

```ts
interface Change {
	path: string;
	status: "added" | "modified" | "deleted";
	/** The lines this change introduces, without their leading `+`. */
	added: string[];
}
```

`GitChanges` measures against the ref rather than between two commits, and
counts files git has never been told about. Outside arbor, which refuses to
merge a dirty tree, the usual caller is a loop that has just finished editing
and committed nothing, so a changeset that only saw commits would miss the
whole change.

## A rule

`checkedBy` says what settles the rule, which is also what makes `check`
required or absent:

| `checkedBy` | implements | what settles it | what it costs |
| --- | --- | --- | --- |
| `"code"` | `Checked` | reading the changeset | nothing |
| `"code-then-agent"` | `PartlyChecked` | the check what it can, an agent the rest | one call |
| `"agent"` | `Reviewed` | an agent reading the change | one call |

Checks run first, so a change stopped by a free rule never pays for an agent.

The document is what a human reads and an agent receives verbatim. Its
sections are `## Ships` and `## Needs review`, rather than judge's
`## Good` and `## Bad`: a signoff rule is not about right and wrong, it is
about who decides.

## The rule this package ships

`tests-not-weakened`: a change may add tests, rewrite them, or delete a test
for code it also deletes; it may not quietly cover less than it did. A test
file deleted while its subject survives, a `.skip` added, a `.only` added.

The merge gate runs the tests, so the tests are what stands between a change
and trunk. A change that weakens them passes its own gate, green either way.
Only something reading the change to the tests can tell the difference.

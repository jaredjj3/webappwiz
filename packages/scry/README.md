# @webappwiz/scry

Rules checked by code, the engine that runs them against a change, and
webappwiz's catalog of them. A rule is English a person reads and a class
that checks it: code decides what it can, and asks a decision model only
what code cannot. This package loads rules, runs them, and ships the rules
webappwiz maintains. `@webappwiz/cli scry` is its
command line. It was published as `@webappwiz/rules` until it took scry's
name; `@webappwiz/cli update` renames the dependency.

The catalog is one directory per rule under [`catalog/`](./catalog),
exported from `@webappwiz/scry/catalog` as id to the rule's class and the
files in its directory. A project copies the ones it wants into `.wiz/scry` with
`@webappwiz/cli scry add`, or the ones the catalog recommends with
`scry add --recommended`, and writes its own beside them.

## A rule

```
comments-say-why/
├── RULE.md          # prose: what the rule wants, and why
├── rule.ts          # the check, and the rule's settings
├── rule.test.ts     # its tests
└── evals/           # labeled cases
    ├── rate-limiter.good.ts
    └── order-summary.bad.ts
```

`rule.ts` default-exports the rule's class, and its static members are the
rule's settings:

```ts
export default class CommentsSayWhy implements Rule {
	static readonly description =
		"A comment says why the code is so, not what it does.";
	static readonly files = "**/*.{ts,tsx}";
	static readonly level = "warning";
	static readonly threshold = 0.7;
	static readonly recommended = true;

	// the check, below
}
```

`description` is one line for a listing, and the only one required. `files`
is a glob of the files the rule applies to, every file when absent. `level`
is `error` or `warning`, `error` when absent. `threshold` is how sure a
check has to be, from 0 to 1, before a finding is reported, 0.7 when absent;
code is sure, so only a decider's findings ever fall under it.
`recommended: true` puts a rule in the set `scry add --recommended`
installs, which is for a rule that reads on any project rather than one
about a stack it may not have. `RuleClass` types them, and `DeclaredRule.of`
is how the engine reads them: holding a `DeclaredRule` means the class
passed, with the defaults filled in. Anything else fails with `path: why`.

`RULE.md` is prose for whoever fixes a finding, the way a skill's body is:
what the rule expects, and why. The engine never reads it. A rule that
shipped carries the release it came from in its frontmatter, `version:`,
which `scry list` and `scry update` compare; one a project wrote has none.

```markdown
---
version: 0.1.0
---
# Comments say why

Why, and what counts.
```

## A rule's check

`rule.ts` default-exports a class implementing `Rule`: `check(file)` reads
one file and returns a `Finding` for each place it breaks the rule. Matching
its `files`, the threshold, `scry-ignore` comments and the report are not
its concern; the engine handles those.

```ts
import type {
	Comment,
	Decider,
	Finding,
	Rule,
	SourceFile,
	Tools,
} from "@webappwiz/scry";

const RESTATES =
	"Does this comment only restate what the code under it does, rather than say why?";

/** Finds comments that say what the code does instead of why. */
export default class CommentsSayWhy implements Rule {
	private decider: Decider;

	constructor(tools: Tools) {
		this.decider = tools.decider;
	}

	async check(file: SourceFile): Promise<Finding[]> {
		const findings = await Promise.all(
			this.lineComments(file).map(async (comment) =>
				comment.flag(
					"Say why, not what.",
					await this.decider.decide(RESTATES, comment),
					RESTATES,
				),
			),
		);
		return findings;
	}

	/** Comments that are not doc comments: those are another rule's. */
	private lineComments(file: SourceFile): Comment[] {
		return file.ts.comments().filter((comment) => !comment.doc);
	}
}
```

Code first. Everything a program can settle, it settles: which nodes to
look at, which are excused, what counts as a match. A finding code decides
has confidence 1. Only what takes judgment goes to the decider, as a
yes-or-no question about a span, and its answer, the probability of yes, is
the finding's confidence: `span.flag(message, confidence, question)`. The
question rides along on the finding, so a report can say what decided it.
Ask about the narrowest span that holds the answer; the decider reads the
whole file around it either way.

Name the private methods for the sentences of the rule, so `check` reads as
the rule does: `stateKeptBetweenCalls`, `setupOnlyOneTestUses`,
`namedForTheFile`. A rule that only reads code takes no constructor at all.

Import only types from `@webappwiz/scry` in `rule.ts`. They are erased when
it runs, so a rule's check runs wherever the CLI does, whatever the project
has installed.

## The toolkit

`SourceFile` is the file a rule reads: its `path` from the project root,
`text`, `lines`, and `stem`, the name up to its first dot (`cart` for
`cart.test.ts`). `matches(pattern)` gives a `Span` for each match of a
global regular expression, for rules about text.

`file.ts` is the file as TypeScript, parsed once however many rules read it,
over [ast-grep](https://ast-grep.github.io):

- `topLevel()`: the top-level statements, with `export` unwrapped to what
  it exports.
- `topLevelClasses()`: the classes declared there, as `Declaration`s with a
  `name`.
- `comments()`: every comment but `scry-ignore` directives, as `Comment`s
  that know whether they are `doc` comments.
- `tests()`: the body of every `it` and `test`, `.only`, `.skip` and
  `.each(...)` included.
- `findAll(matcher)` and `root`, for rules that walk the tree themselves. A
  matcher is an ast-grep pattern like `this.$FIELD = $VALUE` or a rule like
  `{ rule: { kind: "if_statement" } }`.

Each of those is a `Span`, something a finding can point at: a `line` from
1, its `text`, `withNext(count)` for it and the lines after, and `flag`. A
`SyntaxNode` is a span with its `kind` (tree-sitter's TypeScript grammar's,
like `call_expression`), `end`, `is(...kinds)`, `field(name)`, `children()`,
`parent()`, `ancestors()`, `findAll(matcher)`, `captured(name)` for what a
pattern's `$NAME` matched, and `inside(matcher)`.

## Tests

A rule's `rule.test.ts` runs it on its labeled cases, the way tests sit
beside code, and pins anything subtler by hand:

```ts
import { describe, expect, it } from "bun:test";
import { Cases, SourceFile } from "@webappwiz/scry";
import OneClassPerFile from "./rule";

const cases = await Cases.load(import.meta.dir);

describe("one-class-per-file", () => {
	const rule = new OneClassPerFile();

	it.each(cases.bad)("flags $name", async ({ file }) => {
		expect(await rule.check(file)).not.toEqual([]);
	});

	it.each(cases.good)("passes $name", async ({ file }) => {
		expect(await rule.check(file)).toEqual([]);
	});

	it("keeps the class the file is named for, wherever it sits", async () => {
		const file = new SourceFile(
			"lru-cache.ts",
			"class Entry {}\nexport class LruCache {}\n",
		);

		expect(await rule.check(file)).toEqual([
			{ line: 1, message: "Give Entry a file of its own.", confidence: 1 },
		]);
	});
});
```

A rule that asks a decider is built with a fake one, from
`@webappwiz/scry/testing`:

```ts
import { FakeDecider } from "@webappwiz/scry/testing";

it("asks about line comments, and not doc comments", async () => {
	const decider = new FakeDecider({ "add one": 0.95 });
	const file = new SourceFile("a.ts", "/** A counter. */\n// add one\ni++;\n");

	const findings = await new CommentsSayWhy({ decider }).check(file);

	expect(findings.map((finding) => [finding.line, finding.confidence])).toEqual(
		[[2, 0.95]],
	);
});
```

`Cases.load(dir)` reads the cases of the rule in `dir`, each file in its
`evals/`. A case file is `<name>.good.<ext>` or `<name>.bad.<ext>`, and the
rule reads it as `<name>.<ext>`, so `cart.test.bad.ts` is a `cart.test.ts`
that breaks the rule. A check never checks a rule's
own directory or its cases, and the repository's biome and tsc leave cases
out, since a bad one breaks the rule on purpose.

`FakeDecider(answers, otherwise)` answers by what the span it is asked
about contains: the probability under the first key the span's text
includes, and `otherwise`, 0 by default, when none does. It keeps what it
was `asked`, so a test can say which spans went to the model. With a fake,
a rule's tests test its code: what it flags on its own, and what it asks
about. Whether its questions are good ones is what measuring is for.

`wiz scry test [ids]` runs the tests beside each rule in `.wiz/scry`. Unlike
a `rule.ts`, a test imports values from `@webappwiz/scry`, so a project
with rules adds the package as a devDependency, `bun add -d
@webappwiz/scry`, rather than count on the copy the CLI brings being
hoisted where the tests can find it. `wiz scry add` says so when it is
missing.

## Measuring

`Rules.measure({ ids, tools })` runs each rule on its cases with a real
decider, the way a check would: what a `scry-ignore` comment excuses and
what falls under the threshold are not findings. A bad case is right when
something is found in it, a good one when nothing is. `wiz scry measure
[ids]` prints the score per rule, then each case a rule got wrong and why.
It is how a question's wording, a threshold, or a model is tuned: measure,
change one thing, measure again. Every case of every rule runs at once, so
the decider batches them as it would a check.

## A check

```ts
const { root, paths } = await Git.locate(process.cwd(), ["packages/api"]);
const rules = await Rules.load(root);
const changes = await new Git(root).changes("main", paths);
const account = { id: accountId, token: apiToken };
const decider = new BatchedDecider(new Clef("clef", account), { jobs: 8 });
const report = await rules.check({
	paths: changes.files.map((file) => file.path),
	tools: { decider },
});
```

`Rules.load(dir)` imports every rule's `rule.ts` under `<dir>/.wiz/scry`
and reports every broken one at once: a directory with no `rule.ts`, one
that fails to import, or a class missing a setting or giving a bad one. `Git.changes` is what changed since a ref, or with none,
the uncommitted work when there is any and otherwise the branch since
trunk, kept to the paths it is given. `Git.locate` finds the repository root
and turns paths from a working directory into paths from it.

`check` builds each rule whose `files` match a path with the `Tools`, then
runs every rule on every file at once, reading and parsing each file once
however many rules read it. A `Report` holds the `problems`, each a finding
with its `path`, `rule` and `level`; what went `unchecked`, a rule that threw
on being built or on a file, never guessed at; and how many findings were
`dropped` under a threshold or `ignored` by a comment.

A `Decider` answers `decide(question, span)` with the probability of yes.
`BatchedDecider` holds questions until everything running has asked, then
sends the ones about each file in one request, up to 64, to a `Judge`:
`Clef` (`clef` or `clef-flash` on Cloudflare Workers AI) or `Jev` (on
TypeSafe, or anything else serving `/v1/systemone`). A rule written as plain
`await`s still shares a request with every other rule reading the file. A
decider is cheap until a rule asks it something, so a change no rule asks
about costs nothing.

## Thresholds and ignores

A finding under its rule's `threshold` is dropped. Raise the threshold for a
rule that reports too much, lower it for one that misses, and measure
after either.

Code excuses itself from a rule with a `scry-ignore <id>: <reason>` comment
in the comment lines right above the line, or `scry-ignore-file <id>:
<reason>` anywhere for the file. `comments()` leaves these out, so a rule
about comments never reads them. Before scry they were `rule-ignore` and
`rule-ignore-file`, which still count.

## Decisions

`CachedDecider` keeps every answer in `Decisions`, one JSON file the CLI
keeps at `node_modules/.cache/webappwiz/scry/decisions.json`. An answer is
reused for the same model, question, line and file to the byte, so checking
an unchanged file again asks nothing, and an edit retires what was asked
about it. The store doubles as the trace: `wiz scry why path:line` says what
a model was asked about that line and what it answered, which is why a
finding was reported or dropped. When nothing was asked there, code decided
it.

A rule's `rule.ts` runs on every check, so it is code a project trusts the
way it trusts an agent skill: read it before it runs.

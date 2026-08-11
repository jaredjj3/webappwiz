# @webappwiz/lint

Deterministic lint rules for the checks an agent used to make. Lints every
git-tracked file a rule's glob wants and reports like a compiler:
`path:line:column rule message`. Errors fail the run; warnings only print.

`wiz fix` runs it. Standalone: `bunx @webappwiz/lint`.

## Rules

- `no-em-dashes`: no em dashes in code, comments, or prose; an en dash
  survives only between digits, as a range.
- `one-class-per-file`: a second top-level class wants its own file.
- `classes-over-function-exports`: a file may export one function that takes
  a function-typed parameter; several should become a class that receives
  those dependencies once, through its constructor.

## Ignoring a finding

The marker works from any comment syntax and the reason is required:

```ts
// lint-ignore one-class-per-file: local fakes for this suite
```

A marker excuses the statement or declaration under it. `lint-ignore-file`
excuses the whole file.

## Sharing and writing rules

A rule is a class implementing `Rule`, one per file, so a check too long for
one method can break itself up privately. A rule set is an array of them,
shared like any other export. A `lint.config.ts` at the repository root
replaces the recommended set:

```ts
import { type Finding, type Level, type Rule, recommended } from "@webappwiz/lint";

class NoFixme implements Rule {
	readonly id = "no-fixme";
	readonly files = "**/*.ts";
	readonly level: Level = "warning";

	check(text: string): Finding[] {
		return text
			.split("\n")
			.flatMap((line, i) =>
				line.includes("FIXME")
					? [{ line: i + 1, column: 1, message: "FIXME left behind" }]
					: [],
			);
	}
}

export default [...recommended, new NoFixme()];
```

`tokens()` hands a rule TypeScript's token stream (comment- and string-safe,
with line, column, and brace depth) when text alone is not enough.

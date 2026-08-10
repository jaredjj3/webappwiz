---
files: "**/*.test.ts"
---

# Tests read like sentences

Tests use bun:test. A test file makes exactly one `describe` call — never
nested, never several side by side. Every test is an `it` whose string
completes the sentence "it …" naturally: the behavior comes first, the
condition after. If a title leads with the action under test instead of the
observable behavior, rewrite it.

## Good

```ts
import { describe, expect, it } from "bun:test";

describe("repo", () => {
	it("reads from the database when calling foo", () => {
		expect(repo.foo()).toEqual(row);
	});

	it("throws when the connection is closed", () => {
		expect(() => repo.foo()).toThrow();
	});
});
```

## Bad

Nested or repeated describes:

```ts
describe("repo", () => {
	describe("foo", () => {
		it("works", () => {});
	});
});

describe("repo, again", () => {});
```

Titles that lead with the action instead of the behavior:

```ts
it("calling foo reads from the database", () => {});
```

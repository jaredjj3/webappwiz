---
files: "**/*.ts"
---

# Classes over function exports

A file should not export several functions that each take their dependencies
as parameters: injecting those dependencies in tests is awkward, and the
dependency list repeats at every call site. Group that behavior into a class
that receives its dependencies once, through its constructor. Depend on
interfaces, not concrete classes, so a test can hand in a fake.

There is no prescriptive mapping from functions to classes: one class may
absorb several related functions. A file exporting a single function is
acceptable, and pure helpers that take no dependencies may share a file
freely; the rule targets dependency-taking functions.

## Good

```ts
interface Clock {
	now(): Date;
}

export class Stamper {
	constructor(private clock: Clock) {}

	stamp(message: string): string {
		return `${this.clock.now().toISOString()} ${message}`;
	}
}
```

Pure, dependency-free helpers are fine alongside it:

```ts
export const trimmed = (message: string): string => message.trim();
```

## Bad

```ts
export function stamp(message: string, clock: Clock): string {
	return `${clock.now().toISOString()} ${message}`;
}

export function stampAll(messages: string[], clock: Clock): string[] {
	return messages.map((m) => stamp(m, clock));
}
```

Injecting a concrete class instead of an interface is also a violation:

```ts
export class Stamper {
	constructor(private clock: SystemClock) {}
}
```

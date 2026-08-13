# Classes over function exports

A file should not export several functions that each take their dependencies
as parameters: injecting those dependencies in tests is awkward, and the
dependency list repeats at every call site. Group that behavior into a class
that receives its dependencies once, through its constructor.

Take an interface when the dependency has more than one implementation, or a
second one is coming: a fake for tests counts. A dependency with one
implementation and no second in sight is injected as the class it is, since an
interface with a single implementation is a file to keep in step and nothing
else.

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

A dependency with one implementation is injected as itself:

```ts
export class Report {
	constructor(private writer: MarkdownWriter) {}
}
```

Pure, dependency-free helpers are fine alongside it:

```ts
export const trimmed = (message: string): string => message.trim();
```

One function taking a dependency is fine on its own: the rule is about a file
full of them.

```ts
export function stamp(message: string, now: () => Date): string {
	return `${now().toISOString()} ${message}`;
}
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

Naming one implementation of a dependency that has several shuts the others
out, so a test cannot hand in the fake:

```ts
// Fs is implemented by NodeFs and FakeFs, so that is what the parameter is
export class Reader {
	constructor(private fs: NodeFs) {}
}
```

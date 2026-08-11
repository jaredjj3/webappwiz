# One directory per interface

When an interface has more than one implementation, prefer giving it its own
directory, named after the interface. The interface goes in a file of that
same name, and every implementation sits beside it.

Whatever an implementation owns travels with it: its tests, and any data file
it reads. What does not belong is a file about something else, or an
`index.ts` barrel re-exporting the directory.

This one is a preference rather than a line, so it reports as a warning: a
directory that has grown a good reason to hold something else is a judgment
call, not a defect.

Until a second implementation exists, write a concrete class in a plain file
and no interface. A comment may say that the interface is coming. A fake for
tests counts as an implementation, so writing one means making the interface
and the directory.

## Good

```text
packages/sys/fs/
	fs.ts             # export interface Fs
	node-fs.ts        # export class NodeFs implements Fs
	node-fs.test.ts
	fake-fs.ts        # export class FakeFs implements Fs
	fake-fs.test.ts
```

A file an implementation reads is part of it, and sits with it:

```text
packages/lint/rule/
	rule.ts           # export interface Rule
	no-em-dashes.ts   # export class NoEmDashes implements Rule
	no-em-dashes.md   # the document that class imports
	no-em-dashes.test.ts
```

One implementation, so a plain file and no interface:

```ts
// packages/sys/system-clock.ts
// A second implementation moves this into sys/clock/ behind a Clock interface.
export class SystemClock {
	now(): Date {
		return new Date();
	}
}
```

## Bad

Implementations scattered across the tree:

```text
packages/sys/fs.ts
packages/sys/node-fs.ts
packages/testing/fake-fs.ts
```

A directory named for something other than the interface, holding unrelated
files, or re-exporting through a barrel:

```text
packages/sys/filesystem/
	index.ts
	fs.ts
	node-fs.ts
	path-utils.ts
```

An interface with one implementation:

```ts
// packages/sys/system-clock.ts
export interface Clock {
	now(): Date;
}

export class SystemClock implements Clock {
	now(): Date {
		return new Date();
	}
}
```

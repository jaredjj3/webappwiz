---
files: "**/*.ts"
---

# One directory per interface

When an interface has more than one implementation, give it its own directory,
named after the interface. The interface goes in a file of that same name, and
every implementation sits beside it, with its tests. Nothing else goes in the
directory, and there is no `index.ts` barrel.

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

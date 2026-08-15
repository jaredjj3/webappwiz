# One directory per interface

When an interface has implementations, prefer giving it its own directory,
named after the interface. The interface goes in a file of that same name, and
every implementation sits beside it.

Whatever an implementation owns travels with it: its tests, and any data file
it reads. What does not belong is a file about something else, or an
`index.ts` barrel re-exporting the directory.

This one is a preference rather than a line, so it reports as a warning: a
directory that has grown a good reason to hold something else is a judgment
call, not a defect.

A fake for tests counts as an implementation, so writing one means making the
interface and the directory.

## Good

```text
packages/system/fs/
	fs.ts             # export interface Fs
	node-fs.ts        # export class NodeFs implements Fs
	node-fs.test.ts
	fake-fs.ts        # export class FakeFs implements Fs
	fake-fs.test.ts
```

A file an implementation reads is part of it, and sits with it:

```text
packages/judge/rule/
	rule.ts           # export interface Rule
	no-em-dashes.ts   # export class NoEmDashes implements Rule
	no-em-dashes.md   # the document that class imports
	no-em-dashes.test.ts
```

## Bad

Implementations scattered across the tree:

```text
packages/system/fs.ts
packages/system/node-fs.ts
packages/testing/fake-fs.ts
```

A directory named for something other than the interface, holding unrelated
files, or re-exporting through a barrel:

```text
packages/system/filesystem/
	index.ts
	fs.ts
	node-fs.ts
	path-utils.ts
```

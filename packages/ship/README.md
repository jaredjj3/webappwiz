# @webappwiz/ship

Declare what your repository ships, and release it all together at one
version. It is a library, not a CLI: the same declaration backs a terminal
command, an MCP tool and an HTTP endpoint, because deciding what to release is
separate from doing it.

```ts
import { Runner, ships } from "@webappwiz/ship";

const release = ships.lockstep(
	ships.npm("@scope/foo"),
	ships.npm("@scope/bar"),
	ships.github(),
);

await new Runner().ship(release, "patch");
```

That is a whole release script. Every `ships` factory hands back a `Ship`, so
they compose freely: `ships.npm` publishes a package, `ships.github()` writes
the release notes, and `lockstep` moves the lot to one version together.

## Anywhere npm is not the answer

`ships.custom` takes any `Registry`, so nothing here is tied to a package
manager:

```ts
import { type Registry, ships } from "@webappwiz/ship";

class CrateRegistry implements Registry {
	async problems() {
		return []; // whatever blocks publishing, with a remedy when one exists
	}
	async published(name: string, version: string) {
		return false;
	}
	async publish(dir: string) {}
}

const release = ships.lockstep(
	ships.npm("@scope/foo"),
	ships.custom("scope-foo-sys", new CrateRegistry()),
);
```

A registry answers three questions: what is blocking you, do you already have
this version, and please publish this directory. Implement those and it
composes with everything else.

For a workspace whose packages all go to npm, `ships.workspace()` reads the
roster off your manifest instead:

```ts
await new Runner().ship(await ships.workspace(), "minor");
```

## What a ship is

Three members, whether it publishes one package or a hundred:

```ts
interface Ship {
	readonly packages: readonly string[];
	problems(): Promise<Problem[]>;
	run(release: Release): Promise<void>;
}
```

`packages` is the declaration the runner cross-checks against your manifest,
`problems` is what stands in the way, and `run` carries the step out inside a
release that is already stamped and committed. Write your own and it drops
into a `lockstep` beside the ones here.

## The runner

`Runner` is the flow around a declaration: say what is in the way, run the
remedy for each problem it can fix, look again, print what would go out, ask,
and release it. Give it a `log`, `ps` or `prompt` to put it somewhere else,
and a `workspace` or `git` to point it at a repository that is not the one
around the working directory.

It owns the parts of a release that are nobody's step: choosing the version,
stamping every package, committing, and pushing.

## Problems belong to the caller

Preflight failures come back as data, not exceptions, because how you recover
depends on where you are running:

```ts
for (const problem of await release.problems()) {
	console.log(problem.message); // "not logged in to npm"
	problem.remedy; // ["npm", "login"], or undefined
}
```

Each registry reports its own problems and names its own remedy, so a custom
registry gets the same treatment npm does.

A `remedy` is an interactive command. In a terminal, run it and look again:
that is what `Runner` does, and it belongs there because that is the only
place a TTY is guaranteed. In a server, do not run it. `npm login` with
nothing to read from waits forever instead of failing, so show the command and
let someone run it, or set `NPM_TOKEN` and `GH_TOKEN` in the environment and
the problem never comes up.

Problems with no remedy are diagnosis only: a dirty tree, the wrong branch, or
a declaration that has drifted from the repository. That last one is why the
declaration is safe to write by hand. Name a package that no longer exists, or
add a public package and forget to declare it, and the runner says so before
anything is stamped.

## Interrupted releases

Packages publish first, then the version is tagged and pushed. Tagging a
version the registry never received leaves a permanent lie behind, so the tag
is the last thing to happen and means the release finished.

That ordering is in the shape of the thing: `Release.tag()` makes the tag the
first time a step asks for it, and the step that asks is the release notes,
declared last. Nothing can tag ahead of the publishes that run before it.

It also makes a failed release resumable. The runner spots a release commit at
HEAD with no tag, keeps the same version instead of bumping past it, and every
package the registry already has is skipped. Running it again after a network
failure finishes the job rather than burning a version.

## What it leaves to you

Quality gates. Nothing here runs your formatter, tests or build, because which
ones matter is your repo's business, not this package's. Run them before you
call the runner.

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
	async published(name: string, version: string) {
		return false;
	}
	async publish(dir: string) {
		// log in if that is what publishing here takes, then publish or throw
	}
}

const release = ships.lockstep(
	ships.npm("@scope/foo"),
	ships.custom("scope-foo-sys", new CrateRegistry()),
);
```

A registry answers two questions: do you already have this version, and please
publish this directory. Implement those and it composes with everything else.

For a workspace whose packages all go to npm, `ships.workspace()` reads the
roster off your manifest instead:

```ts
await new Runner().ship(await ships.workspace(), "minor");
```

## What a ship is

Two members, whether it publishes one package or a hundred:

```ts
interface Ship {
	readonly packages: readonly string[];
	run(release: Release): Promise<void>;
}
```

`packages` is the declaration the runner cross-checks against your manifest,
and `run` carries the step out inside a release that is already stamped and
committed. Write your own and it drops into a `lockstep` beside the ones here.

## The runner

`Runner` is the flow around a declaration: print what would go out, ask, and
release it. Give it a `log`, `ps` or `prompt` to put it somewhere else, and a
`workspace` or `git` to point it at a repository that is not the one around
the working directory.

It owns the parts of a release that are nobody's step: choosing the version,
stamping every package, committing, and pushing.

Two things it will not do. It will not release from anywhere but the default
branch, because switching for you would release code you were not looking at.
And it will not release a declaration that has drifted from the manifest,
saying every disagreement at once: name a package that no longer exists, or
add a public package and forget to declare it, and you hear about it before
anything is stamped. That is what makes a declaration safe to write by hand.

Uncommitted changes are not refused. The release commit takes every tracked
change with it whatever anyone thinks about it, so the prompt says so and you
answer.

## Logging in is part of publishing

Nothing asks you to be logged in beforehand. A step that needs credentials
gets them where it needs them: `ships.npm` runs `npm login` when `npm whoami`
comes back with nobody, and `ships.github()` runs `gh auth login` the same
way. Publishing then carries on. There is no preflight to keep in step with
what publishing actually does, and no remedy for a caller to relay.

Set `NPM_TOKEN` and `GH_TOKEN` and neither login ever runs. In CI, set them:
`npm login` reads from a human, and where there is none it would sit waiting
rather than failing, so a release under `CI` says which token to set instead of
asking.

Anything else that goes wrong throws, because there is nothing to decide about
a publish that failed halfway. Run the release again: the version is already
stamped and committed, every package the registry took is skipped, and the
second run finishes it rather than burning a version.

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

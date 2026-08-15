# @webappwiz/ship

Declare what your repository ships, and release it all together at one
version. It is a library, not a CLI: the same declaration backs a terminal
command, an MCP tool and an HTTP endpoint, because deciding what to release is
separate from doing it.

```ts
import { releases, ship } from "@webappwiz/ship";

const release = releases.lockstep(
	releases.npm("@scope/foo"),
	releases.npm("@scope/bar"),
	releases.git(),
	releases.github(),
);

await ship(release, "patch");
```

That is a whole release script. `releases` composes, `ship` runs, and nothing
else is public. Every part goes out in the order you declared it: the packages
publish, `releases.git()` tags and pushes, and `releases.github()` writes the
notes for the tag it finds there.

## Anywhere npm is not the answer

`releases.custom` takes any `Registry`, so nothing here is tied to a package
manager:

```ts
import { type Registry, releases } from "@webappwiz/ship";

class CrateRegistry implements Registry {
	async published(name: string, version: string) {
		return false;
	}
	async publish(dir: string) {
		// log in if that is what publishing here takes, then publish or throw
	}
}

const release = releases.lockstep(
	releases.npm("@scope/foo"),
	releases.custom("scope-foo-sys", new CrateRegistry()),
	releases.git(),
);
```

A registry answers two questions: do you already have this version, and please
publish this directory. Implement those and it composes with everything else.

For a workspace whose packages all go to npm, `releases.workspace()` reads the
roster off your manifest instead:

```ts
await ship(await releases.workspace(), "minor");
```

## What a part is

Two members, whether it publishes one package or a hundred:

```ts
interface Release {
	readonly packages: readonly string[];
	publish(cut: Cut): Promise<void>;
}
```

`packages` is the declaration `ship` cross-checks against your manifest, and
`publish` carries the part out. A `Cut` is the release under way: `version`,
`tag`, `dir(name)` for a package's directory, and a `log`. By the time a part
sees one, every package is stamped and committed.

Write your own and it drops into a `lockstep` beside the ones here:

```ts
class DockerRelease implements Release {
	readonly packages = []; // nothing the manifest carries

	async publish(cut: Cut) {
		await push(`app:${cut.version}`);
	}
}
```

## Shipping

`ship(release, bump, opts)` is the whole flow: print what would go out, ask,
stamp every package, commit, and publish each part in turn. Give it a `log`,
`ps` or `prompt` to put it somewhere other than a terminal, and a `workspace`
or `git` to point it at a repository that is not the one around the working
directory.

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

Nothing asks you to be logged in beforehand. A part that needs credentials
gets them where it needs them: `releases.npm` runs `npm login` when
`npm whoami` comes back with nobody, and `releases.github()` runs
`gh auth login` the same way. Publishing then carries on. There is no
preflight to keep in step with what publishing actually does.

Set `NPM_TOKEN` and `GH_TOKEN` and neither login ever runs. In CI, set them:
`npm login` reads from a human, and where there is none it would sit waiting
rather than failing, so a release under `CI` says which token to set instead of
asking.

Anything else that goes wrong throws, because there is nothing to decide about
a publish that failed halfway. Run the release again: the version is already
stamped and committed, every package the registry took is skipped, and the
second run finishes it rather than burning a version.

## The tag comes last

Packages publish first, then the version is tagged and pushed. Tagging a
version the registry never received leaves a permanent lie behind, so
`releases.git()` goes after the packages it tags, and `releases.lockstep`
refuses a declaration that puts it anywhere else.

The tag is also what says a release finished, so `ship` refuses a declaration
that never tags: without one, the next release reads the commit as one that
died partway.

That is what makes a failed release resumable. `ship` spots a release commit
at HEAD with no tag, keeps the same version instead of bumping past it, and
every package the registry already has is skipped. Running it again after a
network failure finishes the job rather than burning a version.

## What it leaves to you

Quality gates. Nothing here runs your formatter, tests or build, because which
ones matter is your repo's business, not this package's. Run them before you
call `ship`.

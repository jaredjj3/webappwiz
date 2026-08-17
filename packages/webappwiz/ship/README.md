# webappwiz/ship

Declare what your repository ships, and release it all together at one
version. It is a library, not a CLI: the same declaration backs a terminal
command, an MCP tool and an HTTP endpoint, because deciding what to release is
separate from doing it.

```ts
import { releases } from "webappwiz/ship";

await releases.lockstep(
	releases.npm("@scope/foo"),
	releases.npm("@scope/bar"),
	releases.git(),
	releases.github(),
).release({ bump: "minor" });
```

That is a whole release script. `releases` composes `Release` objects, and
`release()` runs one: print what would go out, ask, stamp every package,
commit, and carry each artifact out. `bump` says how far the version moves, and
`patch` is the default.

## Declaration order does not matter

Every artifact carries a stage: a `stamp` goes into the release commit, packages
`publish`, then the `tag` goes on, then the `notes` are written about it. A
release runs its artifacts by stage, so this declaration goes out in exactly the
same order as the one above:

```ts
await releases.lockstep(
	releases.github(),
	releases.git(),
	releases.npm("@scope/foo"),
	releases.npm("@scope/bar"),
).release();
```

The point is what the ordering protects: a tag for a version no registry ever
received is a permanent lie, so the tag always follows the packages it names,
as a property of the artifacts rather than a rule about how to write them down.

## Files that say which version they came from

An agent skill carries its version in its own frontmatter, because a copy
somebody installed months ago has nothing else to give its age away.
`releases.skill` keeps that number honest:

```ts
await releases.lockstep(
	releases.npm("@scope/cli"),
	releases.skill("templates/arbor.skill.md"),
	releases.git(),
).release();
```

The path is relative to the workspace root, and the `version:` line in the
document's frontmatter comes out holding the version going out. A skill with no
such line stops the release, since a version nobody wrote down is one nobody can
compare.

It is the `stamp` stage that makes the number true rather than one release
behind: the rewrite happens between stamping the packages and committing them,
so the document goes into the release commit alongside every `package.json`, and
a package that bundles it bundles the version that bundled it.

## The RELEASE file

The moment a release starts, a `RELEASE` file goes down at the workspace
root: the version going out, and which artifacts have landed so far. The last
artifact to land deletes it.

So a `RELEASE` file on disk means the previous run died, and the next
`release()` finishes that version instead of bumping past it. Every artifact the
file says landed is skipped outright, and the rest carry their own checks
(`releases.npm` asks the registry, `releases.git()` leaves an existing tag
alone), so running `release()` again after any failure is always the right
move: nothing goes out twice, and whatever failed is retried. A run that died
between stamping the versions and committing them is the one case that wants a
hand first, since the tree it left behind is dirty: `git checkout` the stamps
and release again, and the version comes back off `RELEASE` as it would have.

The file is in-flight state for one checkout, not history, so put it in your
`.gitignore`:

```gitignore
# a release under way; the last artifact to land deletes it
RELEASE
```

Committing it would hand every other checkout a release that is not theirs to
finish. Getting into a weird state is cheap in both directions, because the per-artifact
checks hold either way. A stale file resumes a release that actually
finished, and every artifact skips; a lost file bumps past a death, and you spend
a version number.

## Anywhere npm is not the answer

`releases.custom` takes any `Registry`, so nothing here is tied to a package
manager:

```ts
import { type Registry, releases } from "webappwiz/ship";

class CrateRegistry implements Registry {
	async published(name: string, version: string) {
		return false;
	}
	async publish(dir: string) {
		// log in if that is what publishing here takes, then publish or throw
	}
}

await releases.lockstep(
	releases.npm("@scope/foo"),
	releases.custom("scope-foo-sys", new CrateRegistry()),
	releases.git(),
).release();
```

A registry answers two questions: do you already have this version, and please
publish this directory. Implement those and it composes with everything else.

For a workspace whose packages all go to npm, `releases.workspace()` reads the
roster off your manifest instead:

```ts
await (await releases.workspace()).release({ bump: "minor" });
```

## What an artifact is

Two members and an optional stage, whether it publishes one package or a
hundred:

```ts
interface Artifact {
	readonly packages: readonly string[];
	readonly stage?: Stage; // "publish" when omitted
	publish(cut: Cut): Promise<void>;
}
```

`packages` is the declaration a release cross-checks against your manifest,
and `publish` carries the artifact out. A `Cut` is the release under way:
`version`, `tag`, `root` for the workspace, `dir(name)` for a package's
directory, and a `log`. By the time an artifact sees one, every package is
stamped; everything past the `stamp` stage sees that stamp committed too.

Write your own and it drops into a `lockstep` beside the ones here:

```ts
class DockerArtifact implements Artifact {
	readonly packages = []; // nothing the manifest carries

	async publish(cut: Cut) {
		await push(`app:${cut.version}`);
	}
}
```

Make `publish` repeatable: a retried release runs it again, so skip whatever
already went out.

## What `release()` will not do

It will not release from anywhere but the default branch, because switching
for you would release code you were not looking at. And it will not release a
declaration that has drifted from the manifest, saying every disagreement at
once: name a package that no longer exists, or add a public package and
forget to declare it, and you hear about it before anything is stamped. That
is what makes a declaration safe to write by hand.

It will not release a dirty tree either. The release commit takes every
tracked change with it, so a dirty tree is a release nobody read: commit what
belongs in it or discard the rest, and what goes out is exactly the version
stamps on top of the commit you were looking at.

Each `release()` asks before any of it. Pass a `prompt` to ask somewhere
other than a terminal, a `log` to say it somewhere else, and a `workspace` or
`git` to point it at a repository that is not the one around the working
directory.

## Logging in is part of publishing

Nothing asks you to be logged in beforehand. An artifact that needs credentials
gets them where it needs them: `releases.npm` runs `npm login` when
`npm whoami` comes back with nobody, and `releases.github()` runs
`gh auth login` the same way. Publishing then carries on. There is no
preflight to keep in step with what publishing actually does.

Set `NPM_TOKEN` and `GH_TOKEN` and neither login ever runs. In CI, set them:
`npm login` reads from a human, and where there is none it would sit waiting
rather than failing, so a release under `CI` says which token to set instead
of asking.

Anything else that goes wrong throws, because there is nothing to decide
about a publish that failed halfway. The `RELEASE` file it leaves behind is
what makes the next `release()` finish the job.

## What it leaves to you

Quality gates. Nothing here runs your formatter, tests or build, because which
ones matter is your repo's business, not this package's. Run them before you
call `release()`.

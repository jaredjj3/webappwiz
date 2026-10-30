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
`publish`, then (for a registry that stages) `approve`, then the `tag` goes on, then the `notes` are written about it. A
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
	releases.skill("skills/arbor/SKILL.md"),
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
	async deployed(name: string) {
		return undefined; // the version installs get now, once there is one
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

A registry answers three questions: do you already have this version, which
version do installs get now, and please publish this directory. Implement those
and it composes with everything else.

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

## The plan

`plan()` lists what `release()` would run, in order, and runs none of it. It
reads the workspace and a RELEASE file, never writes, and touches neither git
nor the network. `wiz dev ship plan` prints it as a list, and `--json` as one
document for a program to read:

```json
{
	"schema": 1,
	"version": "1.2.4",
	"resuming": false,
	"steps": [
		{
			"id": "step:0:Publish @scope/one",
			"name": "Publish @scope/one",
			"stage": "publish",
			"packages": ["@scope/one"],
			"artifact": "@scope/one",
			"deadlineMs": 300000
		}
	]
}
```

`schema` is the shape's version and grows only by adding fields. Each `id` is
the one the step's run-time events carry (`WEBAPPWIZ_SHIP_EVENTS`), so live
progress matches the plan by `id`. `stage` is `preflight`, `stamp`, `build`,
`publish`, `approve`, `tag` or `notes`; `artifact` is present only for a step an artifact
declared.

## The events file

When `WEBAPPWIZ_SHIP_EVENTS` (else `SPLATES_SHIP_EVENTS`) names a file,
`release()` appends one JSON object per line to it: first a `declared` line
for every step in order, then the run-time lines as they happen. Every line
carries `schema` (now `1`, growing only by adding fields), `type`, the step's
`id` (the plan's `id`), `name`, and `at`, an ISO timestamp. Unset or empty, no
file is written.

| `type`     | Extra fields                                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------- |
| `declared` | `stage` (as in the plan), `packages` (string array), `artifact` (when declared by one), `deadlineMs` |
| `started`  | none                                                                                           |
| `staged`   | `package`, `version`, `stageId` (what `npm stage approve` takes) and `url`, the npm page to approve it on |
| `check`    | `passed` (boolean), one per poll of a step's check                                             |
| `done`     | none                                                                                           |
| `skipped`  | none: a resumed release found the step already landed                                          |
| `failed`   | `error`, the message; the release stops after it                                               |

`declared` matches the plan's step by `id`, with the same `stage`, `packages`
and `artifact`.

## Live progress

With `WEBAPPWIZ_SHIP_PROGRESS=1`, `release()` also prints one JSON line per
step event beside its usual output, each a line of its own that starts with `{`:

```json
{"event":"step","id":"step:0:Publish @scope/one","state":"start","at":"2026-10-30T12:00:00.000Z"}
```

`state` is `start`, `done`, `failed` or `skipped`, the last for a step a resumed
release (see the RELEASE file) found already landed. `id` is the plan's `id`, so
every line matches a step in `wiz dev ship plan --json`. Unset, the output is
unchanged.

## What is live

A release pushes versions out and moves on: it never waits for a registry or
its CDN to serve what it published, so the tag goes on as soon as the last
package is out. The exception is a registry that stages. `releases.npm` runs
`npm stage publish` (npm CLI 11.15+, so a stage-only `NPM_TOKEN` works), which
holds each version until a person approves it on npmjs.com or with
`npm stage approve <stage-id>`. It declares a `Stage` step per package, each
reporting a `staged` event, then an `Approve` step per package, in the `approve`
stage, that polls the registry up to an hour, so every package is staged before
any wait and the tag never names a version that is not live. A brand-new package
cannot be staged: publish its first version by hand. Whether a version is installable yet is for whoever needs it
to ask. `status()` reads back what is live. Every artifact
that can say what it has live answers `deployed()`, and `status()` asks them
all beside the workspace's own version, so a caller can show what lags:

```ts
const { version, artifacts } = await release.status();
for (const { name, deployed } of artifacts) {
	console.log(name, deployed === version ? "live" : `at ${deployed ?? "nothing"}`);
}
```

`releases.npm` answers with the `latest` dist-tag, the version installs get;
`releases.git()` with the newest `v*` tag on origin; `releases.github()` with
the release GitHub marks latest. `undefined` means nothing is out yet.
Artifacts with nowhere to ask, a build or a skill stamp, leave `deployed` off
and `status()` skips them. `wiz dev ship status` in this repository prints it,
and is the example to copy for a project's own command.

A custom artifact answers from wherever it publishes to. A web service can
serve the version it was built at and have `deployed()` fetch it back:

```ts
class ServiceArtifact implements Artifact {
	readonly name = "api";
	readonly packages = [];

	async publish(cut: Cut) {
		// deploy with DockerImage's env.variables holding { APP_VERSION: cut.version },
		// which the service's /version route returns
	}

	async deployed() {
		const res = await fetch("https://api.example.com/version");
		return res.ok ? (await res.text()).trim() : undefined;
	}
}
```

`name` is what `status()` calls the artifact; without one it goes by its
packages, or its stage when it has none.

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

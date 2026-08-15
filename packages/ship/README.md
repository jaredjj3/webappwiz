# @webappwiz/ship

Declare what your repository ships, and release it all together at one
version. It is a library, not a CLI: the same declaration backs a terminal
command, an MCP tool and an HTTP endpoint, because deciding what to release is
separate from doing it.

```ts
import { Runner, Ship } from "@webappwiz/ship";

const release = Ship.lockstep(
	Ship.npm("@scope/foo"),
	Ship.npm("@scope/bar"),
	Ship.github(),
);

await new Runner().ship(release, "patch");
```

That is a whole release script. `Ship.npm` names a package and the registry
that carries it, `Ship.github()` adds the release notes, and `lockstep` moves
every one of them to the same version together.

## Anywhere npm is not the answer

`Ship.custom` takes any `Registry`, so nothing here is tied to a package
manager:

```ts
import { type Registry, Ship } from "@webappwiz/ship";

class CrateRegistry implements Registry {
	async problems() {
		return []; // whatever blocks publishing, with a remedy when one exists
	}
	async published(name: string, version: string) {
		return false;
	}
	async publish(dir: string) {}
}

const release = Ship.lockstep(
	Ship.npm("@scope/foo"),
	Ship.custom("scope-foo-sys", new CrateRegistry()),
);
```

A registry answers three questions: what is blocking you, do you already have
this version, and please publish this directory. Implement those and it
composes with everything else.

For a workspace whose packages all go to npm, `Ship.workspace()` reads the
roster off your manifest instead:

```ts
await new Runner().ship(await Ship.workspace(), "minor");
```

## The runner, or your own flow

`Runner` is the terminal flow: plan, run the remedy for each problem it can
fix, plan again, print what would go out, ask, and run it. Give it a `log`,
`ps` or `prompt` to put it somewhere else.

Anywhere without a human, skip the runner and drive the release yourself:

```ts
const plan = await release.plan("patch");
if (plan.problems.length === 0 && (await youApprove(plan))) {
	await release.run(plan);
}
```

`plan` reads; it changes nothing. It reports the version the workspace would
move to, every package going out, and whatever stands in the way. `run` takes
that plan, checks all of it again, and only then stamps versions, commits,
publishes, tags, pushes and writes the GitHub release.

## Problems belong to the caller

Preflight failures come back as data, not exceptions, because how you recover
depends on where you are running:

```ts
for (const problem of plan.problems) {
	console.log(problem.message); // "not logged in to npm"
	problem.remedy; // ["npm", "login"], or undefined
}
```

Each registry reports its own problems and names its own remedy, so a custom
registry gets the same treatment npm does.

A `remedy` is an interactive command. In a terminal, run it and re-plan: that
is what `Runner` does, and it belongs there because that is the only place a
TTY is guaranteed. In a server, do not run it. `npm login` with nothing to read
from waits forever instead of failing, so show the command and let someone run
it, or set `NPM_TOKEN` and `GH_TOKEN` in the environment and the problem never
comes up.

Problems with no remedy are diagnosis only: a dirty tree, the wrong branch, or
a declaration that has drifted from the repository. That last one is why the
declaration is safe to write by hand. Name a package that no longer exists, or
add a public package and forget to declare it, and planning says so before
anything is stamped.

## Interrupted releases

Packages publish first, then the version is tagged and pushed. Tagging a
version the registry never received leaves a permanent lie behind, so the tag
is the last thing to happen and means the release finished.

That ordering makes a failed release resumable. `plan` spots a release commit
at HEAD with no tag, keeps the same version instead of bumping past it, and
`run` skips every package the registry already has. Running it again after a
network failure finishes the job rather than burning a version.

## What it leaves to you

Quality gates. Nothing here runs your formatter, tests or build, because which
ones matter is your repo's business, not this package's. Run them before you
call `run`.

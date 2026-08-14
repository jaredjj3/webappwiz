# @webappwiz/ship

Releases every package in a workspace together, at one version. It is a
library, not a CLI: the same code backs a terminal command, an MCP tool and an
HTTP endpoint, because deciding what to release is separate from doing it.

```ts
import { Git, Github, Registry, Ship, Workspace } from "@webappwiz/ship";

const workspace = await Workspace.at(ps.cwd());
const ship = new Ship(
	workspace,
	new Git(workspace.root),
	new Registry(),
	new Github(),
	{ log },
);

const plan = await ship.plan("patch");
if (plan.problems.length === 0 && (await youApprove(plan))) {
	await ship.run(plan);
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

A `remedy` is an interactive command. In a terminal, run it and re-plan: that
is the whole auto-login story, and it lives in the CLI because that is the only
place a TTY is guaranteed. In a server, do not run it. `npm login` with nothing
to read from waits forever instead of failing, so show the command and let
someone run it, or set `NPM_TOKEN` and `GH_TOKEN` in the environment and the
problem never comes up.

Problems with no remedy (a dirty tree, the wrong branch) are diagnosis only. No
command fixes those unattended.

## Interrupted releases

Packages publish first, then the version is tagged and pushed. Tagging a
version the registry never received leaves a permanent lie behind, so the tag
is the last thing to happen and means the release finished.

That ordering makes a failed release resumable. `plan` spots a release commit
at HEAD with no tag, keeps the same version instead of bumping past it, and
`run` skips every package the registry already has. Running it again after a
network failure finishes the job rather than burning a version.

## What it leaves to you

Quality gates. `ship` never runs your formatter, tests or build, because which
ones matter is your repo's business, not this package's. Run them before you
call `run`.

# @webappwiz/cli

Keeps a project in step with a webappwiz release.

```bash
bunx @webappwiz/cli update            # pin @webappwiz/* deps, like bun update
bunx @webappwiz/cli skills            # copy agent skills into .agents/skills
```

## update

Walks a directory for every `package.json` — workspaces, nested apps, anything
— and rewrites each `@webappwiz/*` dependency to one version. They are released
together, so a project running two of them at different versions is running a
combination nobody tested.

The default version is this package's own, which is the point of `bunx`: the
release you invoke is the release you get. `--version` pins something else.
`workspace:` ranges are left alone; inside a monorepo they already track each
other.

```bash
bunx @webappwiz/cli update ./apps --version 1.4.0
```

## skills

Copies the agent skills bundled with this package into `<dir>/.agents/skills/`,
all of them or one by name. Each skill's frontmatter carries the version it came
from, so a stale copy is visible rather than merely wrong.

```bash
bunx @webappwiz/cli skills . arbor
```

The copy replaces what is there; local edits to a synced skill do not survive,
and are not meant to.

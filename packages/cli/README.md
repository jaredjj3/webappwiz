# @webappwiz/cli

Keeps a project in step with a webappwiz release.

```bash
bunx @webappwiz/cli update             # pin @webappwiz/* deps, like bun update
bunx @webappwiz/cli skills ls          # what there is, and what you have
bunx @webappwiz/cli skills add arbor   # install an agent skill
bunx @webappwiz/cli skills update      # refresh the ones already installed
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

Puts the agent skills bundled with this package into `<dir>/.agents/skills/`.
Each skill's frontmatter carries the version it came from, so a stale copy is
visible rather than merely wrong.

```bash
bunx @webappwiz/cli skills ls ./project
bunx @webappwiz/cli skills add arbor ./project
bunx @webappwiz/cli skills update ./project
```

```
SKILL  SHIPS  INSTALLED
arbor  1.4.0  1.3.0
other  1.4.0  -
```

`add` installs one skill by name. `update` refreshes the ones a project already
has and never installs a new one — which skills a project uses is its own
business, and a skill nobody chose should not arrive by way of an update. `ls`
answers the one thing neither can: which version a project is actually holding.

Both replace what is there; local edits to a synced skill do not survive, and
are not meant to.

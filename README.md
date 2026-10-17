# webappwiz

To install dependencies:

```bash
bun install
```

To run:

```bash
bin/wiz --help
```

To put the `bin/` executables (`wiz`, …) on your `PATH`:

```bash
bin/wiz dev path --add    # or `--remove` to take it back off
```

This appends an `export PATH` line to your shell profile (`.zshrc`/`.bashrc`). Restart your shell afterwards to pick it up.

## Worktrees

`wiz` runs the checkout you are standing in, not the one it was installed
from, so a git worktree needs no `./bin/` prefix and no second `path --add`.
Outside a checkout of this repo it falls back to the tree it was installed
from, which is what makes it useful against other projects.

`WEBAPPWIZ_ROOT` pins one checkout instead. Use it for a command that must not
run the tree it is about to rewrite, and when the pin holds no such command it
fails rather than quietly falling back.

## Looking for arbor? 🌲

arbor is now Spinning Plates (`splates`), which runs many coding agents on one
repository at once, each in its own worktree. It no longer lives here: see
[spinningplates.tech](https://spinningplates.tech) and
[`stringsync/splates`](https://github.com/stringsync/splates). Run it with
`bunx @stringsync/splates`. It is a tool on your machine, not a dependency of
this repository.

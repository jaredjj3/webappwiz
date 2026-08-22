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
bin/wiz path --add    # or `--remove` to take it back off
```

This appends an `export PATH` line to your shell profile (`.zshrc`/`.bashrc`). Restart your shell afterwards to pick it up.

## Worktrees

`wiz` and `arbor` run the checkout you are standing in, not the one they were
installed from, so a git worktree needs no `./bin/` prefix and no second
`path --add`. Outside a checkout of this repo they fall back to the tree they
were installed from, which is what makes them useful against other projects.

```bash
WEBAPPWIZ_ROOT="$(arbor path)" arbor merge
```

`WEBAPPWIZ_ROOT` pins one checkout instead. Use it for a command that must not
run the tree it is about to rewrite, and when the pin holds no such command it
fails rather than quietly falling back.

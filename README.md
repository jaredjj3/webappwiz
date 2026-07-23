# webappwiz

To install dependencies:

```bash
bun install
```

To run:

```bash
bun run index.ts
```

To put the `bin/` executables (`wiz`, …) on your `PATH`:

```bash
bun wiz/index.ts path --add    # or `--remove` to take it back off
```

This appends an `export PATH` line to your shell profile (`.zshrc`/`.bashrc`). Restart your shell afterwards to pick it up.

This project was created using `bun init` in bun v1.3.13. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.

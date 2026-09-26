---
name: example-script
description: Shows how a rule ships a script. It asks for nothing, so it never finds anything.
files: "**/*"
level: warning
effort: none
version: 0.0.20
---

# Example script

This rule exists to show the shape a rule with a script takes. It asks
nothing of the code, so there is never anything to report against it.

A rule's directory can hold more than its `RULE.md`:

```
example-script/
├── RULE.md
└── scripts/
    └── check.sh
```

`wiz scry` runs every script in `scripts/` with the changed files the
rule applies to, by the interpreter its `#!` line names. A script prints one
candidate a line, `file:line: message`, and exits 0 whether it found any or
not.

With `effort: none`, as here, the script decides the rule alone: each line it
prints is a finding, and no agent runs. With any other effort, its lines are
candidates handed to the agent, which judges them against the prose and looks
past them for what a script cannot see.

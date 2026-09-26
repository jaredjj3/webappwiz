---
name: example-script
description: Shows how a rule ships a script. It asks for nothing, so it never finds anything.
files: "**/*"
level: warning
version: 0.0.19
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

A script does the mechanical part of a rule, the part a grep or a parser
settles, so the agent judging the rule starts from a short list rather than
every line of every file. It need not settle the rule on its own. Run it with
the changed files this rule applies to:

```sh
sh .wiz/rules/example-script/scripts/check.sh <file>...
```

It prints one candidate a line, `file:line: message`, and exits 0 whether it
found any or not. Judge each candidate against the prose above before
reporting it. This script prints nothing, so the answer here is always no
findings.

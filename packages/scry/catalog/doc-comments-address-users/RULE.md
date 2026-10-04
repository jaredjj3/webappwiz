---
version: 0.0.31
---
# Doc comments address users

A doc comment on an exported class, method, function, or type is read by
external users through their editor. It must speak to them: what the thing is
for and how to use it. Internal development details (implementation notes,
TODOs, refactoring history, caveats only a maintainer cares about) do not
belong there. Put those inside the body as regular comments.

Its cases are in `evals/`: each `.good.` file follows the rule, and each
`.bad.` file breaks it.

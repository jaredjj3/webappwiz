After making code changes:

- `wiz fix` typecheck, format, and lint the project.
- `wiz test` test each package.

Code follows the style guide at `style.ts` (the rules live in
`packages/rules/rules/*.md` — read them). `wiz cli style show` lists the
rules; `wiz cli style analyze` compiles an agent task plan to audit a tree.

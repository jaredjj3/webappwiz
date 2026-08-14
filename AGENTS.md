After making code changes:

- `bin/wiz fix` typecheck, format, and check the project.
- `bin/wiz test` test each package.

Before merging code yourself:

- `bin/wiz cli signoff --print` print the rules, and apply each one to your
  change yourself.

If a rule says your change needs review, escalate instead of merging. Skip this
when the user has already asked to sign off the work themselves.

Don't use em dashes.

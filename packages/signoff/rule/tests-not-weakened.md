# Tests are not weakened

A change may add tests, rewrite them, or delete a test for code it also
deletes. What it may not do without a person looking is quietly cover less
than it did: a test file deleted while the code it tested survives, a test
turned off with `.skip`, or a suite narrowed to one case with `.only`.

The merge gate runs the tests, so the tests are what stands between a change
and trunk. A change that weakens them passes its own gate, and the gate goes
green either way: only something reading the change to the tests can tell the
difference.

Deleting a test with its subject is ordinary work, not a weakening. So is
rewriting one. The question this rule asks a person is always the same: was
that coverage obsolete, or inconvenient?

## Ships

- a new test file, or new cases in one that exists
- `src/parse.ts` and `src/parse.test.ts` deleted together
- a test rewritten, or renamed, with its subject still covered
- `.skip` or `.only` that was already there and is left alone

## Needs review

- `src/parse.test.ts` deleted while `src/parse.ts` survives
- `it.skip(`, `test.skip(` or `describe.skip(` added
- `.only(` added anywhere, which silences every sibling case

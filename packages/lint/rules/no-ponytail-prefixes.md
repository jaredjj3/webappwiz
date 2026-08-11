---
files: "**/*.ts"
---

# No ponytail prefixes on comments

A `ponytail:` prefix marks a comment as an agent's note to itself. It means
nothing to the next reader, who has no session to go back to and no way to act
on the tag. Strip the prefix.

What is left has to stand on its own: keep the comment as plain prose if it
explains why the code is the way it is, and delete the line outright if it only
announces that the code is deliberately simple.

## Good

```ts
// one global lock: per-account locks once throughput matters
const lock = new Mutex();
```

## Bad

```ts
// ponytail: global lock, per-account locks if throughput matters
const lock = new Mutex();
```

```ts
// ponytail: this exists
export class Registry {}
```

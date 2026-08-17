# @webappwiz/t

A small zod-shaped validator: `parse` validates a decoded value, `coerce` turns
a raw string into one first.

```ts
import { t } from "@webappwiz/t";

t.string().parse("hi"); // "hi"
t.number().parse(42); // 42
t.object({ title: t.string() }).parse(JSON.parse(body));

t.number().coerce("42"); // 42, from a CLI argument
t.boolean().coerce("false"); // false
t.enum(["red", "green"]).coerce("red"); // "red"
```

Both throw a `SchemaError` naming the path that failed, so a nested field
reports as `todo.title: expected string`. `safeParse` returns the error
instead:

```ts
const result = t.number().safeParse(input);
if (!result.success) {
	console.error(result.error.path, result.error.reason);
}
```

Implement `Schema<T>` to add your own type, or extend `SchemaBase<T>` to get
`safeParse` for free.

## Using another library instead

Every schema here is a [Standard Schema](https://standardschema.dev), so one of
these goes wherever that interface is asked for, and `validate` takes anybody
else's:

```ts
import { validate } from "@webappwiz/t";
import { z } from "zod";

validate(t.number(), 42); // 42
validate(z.coerce.number(), "42"); // 42, and so does valibot or arktype
```

It throws the same `SchemaError` whichever library wrote the schema, so a
caller handles one error type. `@webappwiz/cmd` and `@webappwiz/rpc` are built
on that: nothing in either of them requires you to use `t`.

Two things the interface has no room for, which is why `t` still has them:

- **`coerce`.** A command line is made of strings, and validating a string
  against a foreign `number` schema fails. Reach for that library's own
  coercion, `z.coerce.number()` rather than `z.number()`.
- **Asynchronous validation.** The interface allows it and nothing here can
  wait, so `validate` refuses it by name rather than handing back a promise
  dressed as a value.

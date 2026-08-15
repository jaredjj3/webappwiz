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

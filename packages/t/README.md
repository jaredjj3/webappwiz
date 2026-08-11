# @webappwiz/t

Tiny schemas that parse a raw string into a typed value.

```ts
import { t } from "@webappwiz/t";

t.string().parse("hi"); // "hi"
t.number().parse("42"); // 42
t.boolean().parse("true"); // true
t.enum(["red", "green"]).parse("red"); // "red"
```

Parsing throws on bad input. Implement `Schema<T>` to add your own type.

# @webappwiz/geometry

The two 2D value types a web app keeps rewriting: `Rect` (an axis-aligned
rectangle) and `Position` (a point).

```ts
import { Position, Rect } from "@webappwiz/geometry";

const card = Rect.fromDomRect(el.getBoundingClientRect());

card.contains(Position.fromEvent(event)); // was the click on the card?
card.intersects(other); // do they overlap?
card.intersection(other); // by how much, or null
```

Both are values: every operation returns a new one, so a rect handed to a
collision index or a layout cache cannot move under it.

```ts
const rect = new Rect(1, 2, 3, 4);
rect.translate(10, 10); // a new rect; `rect` is still at (1, 2)
```

y grows downward, the convention every browser API uses, so `top` is the
smaller y and `bottom` the larger.

Two rects that merely share an edge do not intersect. An overlap of zero is not
an overlap, and counting it as one means nudging things apart by 0px forever.

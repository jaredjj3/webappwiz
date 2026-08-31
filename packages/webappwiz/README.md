# webappwiz

The parts of a web app that get written again every time, behind interfaces a
test can replace. One package, one subpath per module.

```bash
bun add webappwiz
```

```ts
import { Duration } from "webappwiz/time";
import { NodeFs } from "webappwiz/system";
```

There is no `webappwiz` entry point, only the subpaths below. A barrel over all
of them would make `import "webappwiz"` load every module, including the ones
that only run in a browser or only on a server, and it would become the default
for anything that resolves the package by name. Importing what you mean keeps
the rest unread.

| Subpath | |
| --- | --- |
| [`webappwiz/abort`](./abort) | Ways of bringing an `AbortSignal` to bear on work that does not take one |
| [`webappwiz/assert`](./assert) | The invariants a type cannot state, checked at runtime |
| [`webappwiz/browser`](./browser) | The browser platform behind interfaces: scrolling, animation frames, device and visibility |
| [`webappwiz/cmd`](./cmd) | Builds a CLI: subcommands, typed positional arguments and flag options |
| [`webappwiz/config`](./config) | A validated, frozen record of settings, declared once as a `webappwiz/t` shape |
| [`webappwiz/disposable`](./disposable) | Resources that must be released, and stacks that release them in reverse order |
| [`webappwiz/events`](./events) | Typed event dispatch, with a read-only view to hand to whoever listens |
| [`webappwiz/geometry`](./geometry) | The 2D value types a web app keeps rewriting: `Rect`, `Position` and a `QuadTree` |
| [`webappwiz/http`](./http) | Serving HTTP, and the parts of doing so that every app writes again |
| [`webappwiz/id`](./id) | A source of identifiers behind an interface, so tests can make them predictable |
| [`webappwiz/log`](./log) | Logging behind a `Logger` interface, with decorators and an in-memory double |
| [`webappwiz/md`](./md) | A markdown document as a data source: frontmatter fields, sections and code blocks |
| [`webappwiz/rpc`](./rpc) | A typed contract of query and mutation methods, served and called over fetch |
| [`webappwiz/ship`](./ship) | Releases every package in a workspace together, at one version |
| [`webappwiz/system`](./system) | Interfaces for the things that touch the machine, so code under test doesn't |
| [`webappwiz/t`](./t) | A small zod-shaped validator: `parse` validates a decoded value, `coerce` turns a raw string into one |
| [`webappwiz/task`](./task) | Somewhere to say "this needs doing again" without saying when |
| [`webappwiz/time`](./time) | Time as a seam: `Duration`, `Clock` and `Timer`, with fakes for each |
| [`webappwiz/worker`](./worker) | Work sent somewhere else and answered, behind an interface |

## Where a subpath runs

Most of these run anywhere. The ones that do not are kept off their module's
main entry point, so importing a task queue on a server does not reach for
`requestAnimationFrame`:

- Needs a browser: `webappwiz/browser`, `webappwiz/task/browser`,
  `webappwiz/worker/web`
- Needs a server: `webappwiz/cmd`, `webappwiz/http/bun`, `webappwiz/ship`,
  `webappwiz/system`

`platform.test.ts` holds that line, failing if an entry point that runs
anywhere starts reaching one that does not.

The fakes live beside what they replace, under `/testing`: `webappwiz/time/testing`,
`webappwiz/system/testing`, `webappwiz/ship/testing`, `webappwiz/worker/testing`.

## The rest of webappwiz

Everything here has no dependencies to speak of. What does is published
separately, so nothing you did not ask for arrives with it:
[`@webappwiz/react`](../react) (peer `react`),
[`@webappwiz/aws`](../aws) (peers `aws-cdk-lib`, `constructs`),
[`@webappwiz/rules`](../rules) (peer `typescript`), and the two commands,
[`@webappwiz/cli`](../cli) and [`@webappwiz/arbor`](../arbor).

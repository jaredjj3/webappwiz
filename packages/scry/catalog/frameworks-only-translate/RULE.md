---
version: 0.0.31
---
# Frameworks only translate

A system works from plain code, without a framework around it. A program
does not care whether a CLI invokes it, or a GUI, or a voice, and a system
that works without React is only loosely coupled to React. So the logic,
the meaningful state and the decisions live in plain classes, and React, a
web server or a CLI only adapts them. Any framework counts. The test:
everything but the adapters works, and can be tested, with plain calls. If
something can only be exercised by rendering a component, sending a request
or running a command, the framework is holding logic.

An adapter just translates. A component with three buttons, foo, bar and
baz, calls an `ExampleController` with `foo`, `bar` and `baz` methods whose
arguments are what those controls give. A koa or Hono server routes to a
`FooService` with a method per route, which makes the boundary plain and
another web server easy to use instead. A `webappwiz/cmd` action calls a
program. In an adapter, these are fine:

- translating input into one call per control, route or command;
- translating results into output: markup, a response, lines on stdout;
- purely visual state nothing else cares about, like whether a menu is open;
- keeping up with the framework itself, like a hook that ties an object's
  life to a component's mount.

Everything else goes in the plain class: a draft and whether it changed,
whether a move is allowed, what a save does next, a query and what is
computed from it. Hooks are a React idea, so a thin hook over a plain class
is fine, but the state and the decisions belong to the class, which the
component reads through `useReactive`. It works the other way too: a plain
class that uses a framework's names, like a service whose methods take
koa's `Context`, cannot run without that framework.

This rule asks whether decisions and state live in an adapter at all.
Several pieces of `useState` kept in step by hand are what
reactive-over-use-state reports.

Its cases are in `evals/`: each `.good.` file follows the rule, and each
`.bad.` file breaks it.

# wiz

The workspace's own build of `@webappwiz/cli`, so `wiz rules` and `wiz skills`
answer the same as `bunx @webappwiz/cli`. The commands for working on this repo
itself, which nobody else has any use for, sit under `wiz dev`.

```bash
bin/wiz --help
bin/wiz dev --help
```

`bin/wiz dev test` runs package tests, including Arbor's merge check. Eval
harness tests run separately; these commands make no paid model calls:

```bash
bin/wiz dev test             # all package tests
bin/wiz dev test arbor       # one package
bin/wiz dev test --evals     # free eval harness tests only
bin/wiz dev test --all       # package and eval harness tests
```

When changing files under `evals/`, run `bin/wiz dev test --evals` as well.
`bin/wiz dev eval` runs evaluations and can use paid model calls; run it only
when explicitly requested.

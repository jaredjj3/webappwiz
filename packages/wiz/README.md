# wiz

The workspace's own build of `@webappwiz/cli`, so `wiz rules` and `wiz skills`
answer the same as `bunx @webappwiz/cli`. The commands for working on this repo
itself, which nobody else has any use for, sit under `wiz dev`.

```bash
bin/wiz --help
bin/wiz dev --help
```

`bin/wiz dev test` runs package tests. Eval
harness tests run separately:

```bash
bin/wiz dev test             # all package tests
bin/wiz dev test cli         # one package
bin/wiz dev test --evals     # free eval harness tests only
bin/wiz dev test --all       # package and eval harness tests
```

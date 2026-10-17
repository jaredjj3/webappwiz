Use the splates skill for any work that may change code: start a task with
`splates add` before investigating, and land it with `splates merge`. Install
the CLI with `bunx @stringsync/splates`, or globally so `splates` is on your
PATH; the skill comes from `bunx skills add stringsync/splates --skill splates`.

After making code changes:

- `bin/wiz dev fix` typecheck, format, and check the project, scry included.
- `bin/wiz dev test` test each package. It takes a heavy-job slot itself, so
  it needs no `splates heavy`.

During a splates task, the user may be on the `splates dev` server from another device, so give every link as both its remote and its local URL.

import type { CommandDeps } from "@webappwiz/cli/webappwiz";
import { webappwiz } from "@webappwiz/cli/webappwiz";
import { cli } from "webappwiz/cmd";
import { t } from "webappwiz/t";
import { fix } from "./fix";
import { path } from "./path";
import { ship } from "./ship";
import { test } from "./test";

/** Everything `wiz` is run with. The mounted `cli` commands need the same. */
export type WizDeps = CommandDeps;

export const wiz = cli<WizDeps>("wiz");

wiz
	.command("fix")
	.description("format, check, and typecheck the workspace")
	.option("check", t.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action((opts, { log, ps }) => fix({ ...opts, log, ps }));

wiz
	.command("path")
	.description("manage bin/ on your shell PATH")
	.option("add", t.boolean(), {
		default: false,
		description: "add bin/ to your PATH",
	})
	.option("remove", t.boolean(), {
		default: false,
		description: "remove bin/ from your PATH",
	})
	.action((opts, { log, fs, ps }) => path({ ...opts, log, fs, ps }));

wiz
	.command("ship")
	.description("release every package in the workspace at one patch version")
	.action((_opts, { log, fs, ps }) => ship({ log, fs, ps }));

wiz
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts, { fs, ps }) => test({ ...opts, fs, ps }));

wiz.mount("cli", webappwiz.description("run @webappwiz/cli against a project"));

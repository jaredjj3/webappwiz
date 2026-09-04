import type { CommandDeps } from "@webappwiz/cli/webappwiz";
import { webappwiz } from "@webappwiz/cli/webappwiz";
import { t } from "webappwiz/t";
import { fix } from "./fix";
import { path } from "./path";
import { ship } from "./ship";
import { test } from "./test";

/** Everything `wiz` is run with, which is what the cli it is built on needs. */
export type WizDeps = CommandDeps;

/**
 * `wiz` is the `webappwiz` cli under a shorter name, so a project gets `wiz
 * rules` and `wiz skills` without a prefix. Working on this repo is the
 * unusual case, so the commands that only make sense inside it live under
 * `wiz dev`.
 */
export const wiz = webappwiz("wiz");

const dev = wiz.group("dev").description("work on the webappwiz workspace");

dev
	.command("fix")
	.description("format, check, and typecheck the workspace")
	.option("check", t.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action((opts, { log, ps }) => fix({ ...opts, log, ps }));

dev
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

dev
	.command("ship")
	.description("release every package in the workspace at one patch version")
	.action((_opts, { log, fs, ps }) => ship({ log, fs, ps }));

dev
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts, { fs, ps }) => test({ ...opts, fs, ps }));

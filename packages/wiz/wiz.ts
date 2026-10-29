import type { CommandDeps } from "@webappwiz/cli/webappwiz";
import { webappwiz } from "@webappwiz/cli/webappwiz";
import { z } from "zod";
import { fix } from "./fix";
import { path } from "./path";
import { ship, status } from "./ship";
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
	.option("check", z.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.option("code-only", z.boolean(), {
		default: false,
		description: "run Scry code rules without credentials or model calls",
	})
	.action(({ "code-only": codeOnly, ...opts }, { log, ps }) =>
		fix({ ...opts, codeOnly, log, ps }),
	);

dev
	.command("path")
	.description("manage bin/ on your shell PATH")
	.option("add", z.boolean(), {
		default: false,
		description: "add bin/ to your PATH",
	})
	.option("remove", z.boolean(), {
		default: false,
		description: "remove bin/ from your PATH",
	})
	.action((opts, { log, fs, ps }) => path({ ...opts, log, fs, ps }));

const shipping = dev
	.group("ship")
	.description("release the workspace, or say what it has live")
	.fallback("release");

shipping
	.command("release")
	.description("release every package in the workspace at one patch version")
	.option("yes", z.boolean(), {
		default: false,
		description: "skip the confirmation, for runs without a terminal",
	})
	.action(({ yes }, { log, fs, ps }) => ship({ yes, log, fs, ps }));

shipping
	.command("status")
	.description(
		"print the version each artifact has live beside the workspace's",
	)
	.action((_, { log, fs, ps }) => status({ log, fs, ps }));

dev
	.command("test")
	.description("run package tests; eval harness tests are separate")
	.arg("package", z.string(), {
		default: "",
		description: "only test this package (default: all packages)",
	})
	.option("evals", z.boolean(), {
		default: false,
		description: "run only free eval harness tests (no model calls)",
	})
	.option("all", z.boolean(), {
		default: false,
		description: "run package and eval harness tests together",
	})
	.action((opts, { log, fs, ps }) => test({ ...opts, log, fs, ps }));

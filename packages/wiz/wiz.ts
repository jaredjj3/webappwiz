import type { CommandDeps } from "@webappwiz/cli/commands";
import { commands } from "@webappwiz/cli/commands";
import { WEBAPPWIZ_RULES } from "@webappwiz/cli/rules";
import { cli } from "@webappwiz/cmd";
import { Check } from "@webappwiz/judge";
import {
	CliGit,
	CliGithub,
	LockstepShip,
	ManifestWorkspace,
	NpmRegistry,
} from "@webappwiz/ship";
import { t } from "@webappwiz/t";
import { ToolchainFix } from "./fix/toolchain-fix";
import { Path } from "./path";
import { ship } from "./ship";
import { test } from "./test";

/** Everything `wiz` is run with. The mounted `cli` commands need the same. */
export type WizDeps = CommandDeps;

const toolchainFix = ({ log, fs, ps, glob }: WizDeps): ToolchainFix =>
	new ToolchainFix(
		log,
		ps,
		new Check(log, fs, ps, glob, WEBAPPWIZ_RULES.rules),
	);

export const wiz = cli<WizDeps>("wiz");

wiz
	.command("fix")
	.description("format, check, and typecheck the workspace")
	.option("check", t.boolean(), {
		default: false,
		description: "report problems without writing fixes (for CI)",
	})
	.action((opts, deps) => toolchainFix(deps).run(opts));

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
	.action((opts, { log, fs, ps }) => new Path(log, fs, ps).run(opts));

wiz
	.command("ship")
	.description("release every package in the workspace at one version")
	.arg("bump", t.string(), { description: "patch, minor, or major" })
	.action(async (opts, deps) => {
		const { log, fs, ps } = deps;
		const workspace = await ManifestWorkspace.at(fs, ps.cwd());
		const release = new LockstepShip(
			log,
			workspace,
			new CliGit(ps, workspace.root),
			new NpmRegistry(ps),
			new CliGithub(ps),
		);
		await ship(log, ps, release, toolchainFix(deps), opts);
	});

wiz
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts, { fs, ps }) => test(fs, ps, opts));

commands(wiz.group("cli").description("run @webappwiz/cli against a project"));

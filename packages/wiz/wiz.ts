import type { CommandDeps } from "@webappwiz/cli/commands";
import { commands } from "@webappwiz/cli/commands";
import { cli } from "@webappwiz/cmd";
import {
	CliGit,
	CliGithub,
	LockstepShip,
	ManifestWorkspace,
	NpmRegistry,
} from "@webappwiz/ship";
import { t } from "@webappwiz/t";
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
	.action((opts, { log, fs, ps, glob }) => fix({ ...opts, log, fs, ps, glob }));

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
	.description("release every package in the workspace at one version")
	.arg("bump", t.string(), { description: "patch, minor, or major" })
	.action(async (opts, { log, fs, ps }) => {
		const workspace = await ManifestWorkspace.at(ps.cwd(), { fs });
		const release = new LockstepShip(
			workspace,
			new CliGit(workspace.root, { ps }),
			new NpmRegistry({ ps }),
			new CliGithub({ ps }),
			{ log },
		);
		await ship(release, { ...opts, log, ps });
	});

wiz
	.command("test")
	.description("run the workspace tests")
	.arg("package", t.string(), {
		default: "",
		description: "only test this package (default: all)",
	})
	.action((opts, { fs, ps }) => test({ ...opts, fs, ps }));

commands(wiz.group("cli").description("run @webappwiz/cli against a project"));

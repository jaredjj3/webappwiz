import type { Cli } from "@webappwiz/cmd";
import type { Logger } from "@webappwiz/log";
import type { Fs } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { analyze } from "./analyze";
import * as skills from "./skills";
import { check } from "./style";
import { update } from "./update";

/**
 * Hangs the commands off whatever it is given — the program itself when run as
 * `webappwiz`, or a group when another cli mounts it (`wiz cli`). Nothing here
 * knows which, so both spellings stay the same commands rather than one of them
 * shelling out to the other.
 */
export async function commands(app: Cli, log: Logger, fs: Fs): Promise<void> {
	// Every @webappwiz package is released in lockstep, so this one's version is
	// the version — of the packages to pin, and of the skills bundled here.
	const { version } = JSON.parse(
		await fs.read(`${import.meta.dir}/package.json`),
	);

	app
		.command("update")
		.description("pin every @webappwiz/* dependency in a tree to one version")
		.arg("dir", t.string(), {
			default: ".",
			description: "directory to scan recursively (default: .)",
		})
		.option("version", t.string(), {
			default: version,
			description: "version to pin to",
		})
		.action((opts) => update(opts, log, fs));

	app
		.command("analyze")
		.description(
			"compile a style guide into per-rule analysis tasks for agents",
		)
		.arg("rules", t.string(), {
			description: "style guide module (a .ts file)",
		})
		.arg("dir", t.string(), {
			default: ".",
			description: "directory to analyze (default: .)",
		})
		.option("json", t.boolean(), {
			default: false,
			description: "print a machine-readable plan",
		})
		.option("chunk", t.number(), {
			default: 25,
			description: "files per task",
		})
		.action((opts) => analyze(opts, log, fs));

	app
		.group("style")
		.description("author and check agent style guides")
		.command("check")
		.description("check that a style guide is sound")
		.arg("rules", t.string(), {
			description: "style guide module (a .ts file)",
		})
		.option("strict", t.boolean(), {
			default: false,
			description: "treat warnings as errors",
		})
		.action((opts) => check(opts, log, fs));

	const group = app
		.group("skills")
		.description("manage webappwiz agent skills in .agents/skills");

	group
		.command("ls")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts) => skills.ls(opts, log, fs));

	group
		.command("add")
		.description("add a skill to a project")
		.arg("skill", t.string(), { description: "skill name" })
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts) => skills.add(opts, log, fs));

	group
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts) => skills.update(opts, log, fs));
}

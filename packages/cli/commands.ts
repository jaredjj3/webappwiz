import type { Cli } from "@webappwiz/cmd";
import type { Logger } from "@webappwiz/log";
import { DEFAULT_GUIDE } from "@webappwiz/style";
import type { Fs, Ps } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { SystemClock } from "@webappwiz/time";
import { AGENTS } from "./analyze";
import { Skills } from "./skills";
import { StyleCommands } from "./style";
import { update } from "./update";

/**
 * Adds webappwiz's commands to `app`, which can be a program or a command
 * group.
 */
export async function commands(
	app: Cli,
	log: Logger,
	fs: Fs,
	ps: Ps,
): Promise<void> {
	// Hangs the commands off whatever it is given — the program itself when run
	// as `webappwiz`, or a group when another cli mounts it (`wiz cli`). Nothing
	// here knows which, so both spellings stay the same commands rather than one
	// of them shelling out to the other.

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

	const style = app
		.group("style")
		.description("author, check, and run agent style guides");
	const styleCommands = new StyleCommands(log, fs, ps, new SystemClock());
	const rulesArg = {
		default: DEFAULT_GUIDE,
		description: `style guide module (default: ${DEFAULT_GUIDE})`,
	};

	style
		.command("check")
		.description("check that a style guide is sound")
		.arg("rules", t.string(), rulesArg)
		.option("strict", t.boolean(), {
			default: false,
			description: "treat warnings as errors",
		})
		.action((opts) => styleCommands.check(opts));

	style
		.command("ls")
		.description("list a style guide's rules")
		.arg("rules", t.string(), rulesArg)
		.action((opts) => styleCommands.ls(opts));

	style
		.command("show")
		.description("print one rule in full, by the id `style ls` gives it")
		.arg("id", t.string(), { description: "rule id" })
		.arg("rules", t.string(), rulesArg)
		.action((opts) => styleCommands.show(opts));

	style
		.command("analyze")
		.description("check a directory against a style guide, one agent per rule")
		.arg("rules", t.string(), rulesArg)
		.arg("dir", t.string(), {
			default: ".",
			description: "directory to analyze (default: .)",
		})
		.option("agent", t.optional(t.enum(Object.keys(AGENTS))), {
			default: undefined,
			description: "model to check with; required unless --exec or --prompt",
		})
		.option("exec", t.optional(t.string()), {
			default: undefined,
			description: "command the prompt is passed to, instead of --agent",
		})
		.option("prompt", t.boolean(), {
			default: false,
			description: "print the prompts and run no agent at all",
		})
		.option("chunk", t.number(), {
			default: 25,
			description: "files per task",
		})
		.action((opts) => styleCommands.analyze(opts));

	const skillsGroup = app
		.group("skills")
		.description("manage webappwiz agent skills in .agents/skills");
	const skills = new Skills(log, fs);

	skillsGroup
		.command("ls")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts) => skills.ls(opts));

	skillsGroup
		.command("add")
		.description("add a skill to a project")
		.arg("skill", t.string(), { description: "skill name" })
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts) => skills.add(opts));

	skillsGroup
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts) => skills.update(opts));
}

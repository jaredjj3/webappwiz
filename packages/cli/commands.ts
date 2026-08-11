import type { Cli } from "@webappwiz/cmd";
import { AGENTS, DEFAULT_GUIDE } from "@webappwiz/lint";
import type { Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import { SystemClock } from "@webappwiz/time";
import { LintCommands } from "./lint";
import { Skills } from "./skills";
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
	// Hangs the commands off whatever it is given: the program itself when run
	// as `webappwiz`, or a group when another cli mounts it (`wiz cli`). Nothing
	// here knows which, so both spellings stay the same commands rather than one
	// of them shelling out to the other.

	// Every @webappwiz package is released in lockstep, so this one's version is
	// the version of the packages to pin and of the skills bundled here.
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

	const lint = app
		.group("lint")
		.description("author, audit, and run the guide's agent rules");
	const lintCommands = new LintCommands(log, fs, ps, new SystemClock());
	const rulesArg = {
		default: DEFAULT_GUIDE,
		description: `guide module (default: ${DEFAULT_GUIDE})`,
	};

	lint
		.command("audit")
		.description(
			"check the guide: is it sound, and which rules need no agent at all",
		)
		.arg("rules", t.string(), rulesArg)
		.option("strict", t.boolean(), {
			default: false,
			description: "treat warnings as errors",
		})
		.option("agent", t.optional(t.enum(Object.keys(AGENTS))), {
			default: undefined,
			description: "model to ask with; required unless --exec",
		})
		.option("exec", t.optional(t.string()), {
			default: undefined,
			description: "command the prompt is passed to, instead of --agent",
		})
		.action((opts) => lintCommands.audit(opts));

	lint
		.command("ls")
		.description("list the guide rules")
		.arg("rules", t.string(), rulesArg)
		.action((opts) => lintCommands.ls(opts));

	lint
		.command("show")
		.description("print one rule in full, by the id `lint ls` gives it")
		.arg("id", t.string(), { description: "rule id" })
		.arg("rules", t.string(), rulesArg)
		.action((opts) => lintCommands.show(opts));

	lint
		.command("analyze")
		.description("check a directory against the guide, one agent per rule")
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
		.option("estimate", t.boolean(), {
			default: false,
			description: "print what a run would read, and run nothing",
		})
		.option("chunk", t.number(), {
			default: 25,
			description: "files per task",
		})
		.option("since", t.optional(t.string()), {
			default: undefined,
			description: "only check files added or changed since this git ref",
		})
		.option("budget", t.number(), {
			default: 200_000,
			description: "confirm before reading more than this many tokens",
		})
		.action((opts) => lintCommands.analyze(opts));

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

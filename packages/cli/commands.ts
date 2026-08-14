import type { Cli, Deps } from "@webappwiz/cmd";
import { AGENTS } from "@webappwiz/rules";
import type { Fs, Glob } from "@webappwiz/sys";
import { t } from "@webappwiz/t";
import type { Clock } from "@webappwiz/time";
import { JudgeCommands } from "./judge";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { version } from "./package.json";
import { SIGNOFF_RULES, WEBAPPWIZ_RULES } from "./rules";
import { Skills } from "./skills";
import { update } from "./update";

/** What webappwiz's commands are run with, on top of what any cli needs. */
export interface CommandDeps extends Deps {
	fs: Fs;
	clock: Clock;
	glob: Glob;
}

/**
 * Adds webappwiz's commands to `app`, which can be a program or a command
 * group.
 */
export function commands<D extends CommandDeps>(app: Cli<D>): void {
	// Hangs the commands off whatever it is given: the program itself when run
	// as `webappwiz`, or a group when another cli mounts it (`wiz cli`). Nothing
	// here knows which, so both spellings stay the same commands rather than one
	// of them shelling out to the other.

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
		.action((opts, { log, fs }) => update(log, fs, opts));

	// `judge` and `rules` are siblings rather than one nested in the other: the
	// rule set is shared, with `wiz fix` enforcing the rules that carry a check
	// and `judge` the ones only an agent can decide, so neither owns it.
	const judge = ({ log, fs, ps, clock, glob }: CommandDeps): JudgeCommands =>
		new JudgeCommands(
			log,
			fs,
			ps,
			clock,
			glob,
			WEBAPPWIZ_RULES,
			SIGNOFF_RULES,
		);

	app
		.command("judge")
		.description("check a directory against the config, one agent per glob")
		.arg("dir", t.string(), {
			default: ".",
			description: "directory to judge (default: .)",
		})
		.option("agent", t.optional(t.enum(Object.keys(AGENTS))), {
			default: undefined,
			description: "model to check with (default: the config's agent)",
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
		.action((opts, deps) => judge(deps).judge(opts));

	const rules = app
		.group("rules")
		.description("list and print the rules, to run or to read yourself");

	rules
		.command("ls")
		.description("list the rules")
		.action((_opts, deps) => judge(deps).ls());

	rules
		.command("show")
		.description("print one rule in full, by the id `rules ls` gives it")
		.arg("id", t.string(), { description: "rule id" })
		.action((opts, deps) => judge(deps).show(opts));

	const skillsGroup = app
		.group("skills")
		.description("manage webappwiz agent skills in .agents/skills");

	skillsGroup
		.command("ls")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs }) => new Skills(log, fs).ls(opts));

	skillsGroup
		.command("add")
		.description("add a skill to a project")
		.arg("skill", t.string(), { description: "skill name" })
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts, { log, fs }) => new Skills(log, fs).add(opts));

	skillsGroup
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs }) => new Skills(log, fs).update(opts));
}

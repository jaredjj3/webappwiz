import { cli, type Deps } from "@webappwiz/cmd";
import { AGENTS } from "@webappwiz/rules";
import type { Fs, Glob } from "@webappwiz/system";
import { t } from "@webappwiz/t";
import type { Clock } from "@webappwiz/time";
import { JudgeCommands } from "./judge";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { version } from "./package.json";
import { JUDGE_RULES, SIGNOFF_RULES } from "./rules";
import { Signoff } from "./signoff";
import { add } from "./skills/add";
import { ls } from "./skills/ls";
import { update as updateSkills } from "./skills/update";
import { update } from "./update";

/** What webappwiz's commands are run with, on top of what any cli needs. */
export interface CommandDeps extends Deps {
	fs: Fs;
	clock: Clock;
	glob: Glob;
}

/**
 * The `webappwiz` program. Run on its own it is the `webappwiz` bin; mounted
 * (`wiz.mount("cli", webappwiz)`) the same commands answer as `wiz cli`, so
 * neither spelling shells out to the other.
 */
export const webappwiz = cli<CommandDeps>("webappwiz");

webappwiz
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
	.action((opts, { log, fs }) => update({ ...opts, log, fs }));

// `judge` and `rules` are siblings rather than one nested in the other: the
// rule set is shared, with `wiz fix` enforcing the rules that carry a check
// and `judge` the ones only an agent can decide, so neither owns it.
const judge = ({ log, fs, ps, clock, glob }: CommandDeps): JudgeCommands =>
	new JudgeCommands(JUDGE_RULES, {
		signoffRules: SIGNOFF_RULES,
		log,
		fs,
		ps,
		clock,
		glob,
	});

webappwiz
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
	.option("print", t.boolean(), {
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

webappwiz
	.command("signoff")
	.description("weigh a change against the rules that ask for a person")
	.arg("dir", t.string(), {
		default: ".",
		description: "directory whose change is weighed (default: .)",
	})
	.option("agent", t.optional(t.enum(Object.keys(AGENTS))), {
		default: undefined,
		description: "model to weigh it with (default: the config's agent)",
	})
	.option("exec", t.optional(t.string()), {
		default: undefined,
		description: "command the prompt is passed to, instead of --agent",
	})
	.option("print", t.boolean(), {
		default: false,
		description: "print the rules to apply yourself, and run no agent",
	})
	.option("since", t.string(), {
		default: "main",
		description: "the ref the change is measured against",
	})
	.option("budget", t.number(), {
		default: 200_000,
		description: "confirm before reading more than this many tokens",
	})
	.action((opts, { log, ps, clock }) =>
		new Signoff(SIGNOFF_RULES, JUDGE_RULES.agent, {
			log,
			ps,
			clock,
		}).run(opts),
	);

const rules = webappwiz
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

const skillsGroup = webappwiz
	.group("skills")
	.description("manage webappwiz agent skills in .agents/skills");

skillsGroup
	.command("ls")
	.description("list the skills there are, and what the project has of them")
	.arg("dir", t.string(), {
		default: ".",
		description: "project to inspect (default: .)",
	})
	.action((opts, { log, fs }) => ls({ ...opts, log: log, fs: fs }));

skillsGroup
	.command("add")
	.description("add a skill to a project")
	.arg("skill", t.string(), { description: "skill name" })
	.arg("dir", t.string(), {
		default: ".",
		description: "project to add it to (default: .)",
	})
	.action((opts, { log, fs }) => add({ ...opts, log: log, fs: fs }));

skillsGroup
	.command("update")
	.description("refresh the skills a project already has")
	.arg("dir", t.string(), {
		default: ".",
		description: "project to refresh (default: .)",
	})
	.action((opts, { log, fs }) => updateSkills({ ...opts, log: log, fs: fs }));

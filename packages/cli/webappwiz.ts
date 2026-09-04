import { DEFAULT_CHUNK } from "@webappwiz/rules";
import { type Cli, cli, type Deps } from "webappwiz/cmd";
import type { Fs, Glob } from "webappwiz/system";
import { t } from "webappwiz/t";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { version } from "./package.json";
import { add as addRule } from "./rules/add";
import { ls as lsRules } from "./rules/ls";
import { newRule } from "./rules/new";
import { review } from "./rules/review";
import { update as updateRules } from "./rules/update";
import { add } from "./skills/add";
import { ls } from "./skills/ls";
import { update as updateSkills } from "./skills/update";
import { update } from "./update";

/** What webappwiz's commands are run with, on top of what any cli needs. */
export interface CommandDeps extends Deps {
	fs: Fs;
	glob: Glob;
}

/**
 * Builds the `webappwiz` program. Built rather than declared once so a host
 * program can carry the same commands as its own root: `bin/wiz` builds them
 * under the name `wiz`, and keeps its workspace commands under `wiz dev`.
 * `name` is what help calls the program, so it has to be the spelling the
 * caller is reached by.
 */
export function webappwiz(name = "webappwiz"): Cli<CommandDeps> {
	const program = cli<CommandDeps>(name);

	program
		.command("update")
		.description("pin every webappwiz dependency in a tree to one version")
		.arg("dir", t.string(), {
			default: ".",
			description: "directory to scan recursively (default: .)",
		})
		.option("version", t.string(), {
			default: version,
			description: "version to pin to",
		})
		.action((opts, { log, fs }) => update({ ...opts, log, fs }));

	const rules = program
		.group("rules")
		.description("keep rules in .wiz/rules, and divide a review of them up");

	rules
		.command("ls")
		.description("list the rules there are, and what the project has of them")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs }) => lsRules({ ...opts, log, fs }));

	rules
		.command("new")
		.description("scaffold a rule to fill in, under .wiz/rules/<name>")
		.arg("name", t.string(), { description: "rule id, kebab case" })
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts, { log, fs }) => newRule({ ...opts, log, fs }));

	rules
		.command("add")
		.description("copy shipped rules in: one by id, or every recommended one")
		.arg("rule", t.string(), {
			default: "",
			description:
				"rule id, as `rules ls` lists it; the project with --recommended",
		})
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.option("recommended", t.boolean(), {
			default: false,
			description: "copy every rule that recommends itself, instead of one",
		})
		.action((opts, { log, fs }) => addRule({ ...opts, log, fs }));

	rules
		.command("update")
		.description("refresh the shipped rules the project has copies of")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs }) => updateRules({ ...opts, log, fs }));

	rules
		.command("review")
		.description("print one block of review work per rule the change touches")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to review (default: .)",
		})
		.option("since", t.string(), {
			default: "HEAD",
			description: "git ref the change is measured from (default: HEAD)",
		})
		.option("chunk", t.number(), {
			default: DEFAULT_CHUNK,
			description: "files per block, at most",
		})
		.action((opts, { log, fs, ps, glob }) =>
			review({ ...opts, log, fs, ps, glob }),
		);

	const skills = program
		.group("skills")
		.description("manage webappwiz agent skills in .agents/skills");

	skills
		.command("ls")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs }) => ls({ ...opts, log, fs }));

	skills
		.command("add")
		.description("add a skill to a project")
		.arg("skill", t.string(), { description: "skill name" })
		.arg("dir", t.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts, { log, fs }) => add({ ...opts, log, fs }));

	skills
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", t.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs }) => updateSkills({ ...opts, log, fs }));

	return program;
}

import { type Cli, cli, type Deps, timed } from "webappwiz/cmd";
import type { Fs } from "webappwiz/system";
import { z } from "zod";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { version } from "./package.json";
import { add as addRule } from "./scry/add";
import { check } from "./scry/check";
import { list as listRules } from "./scry/list";
import { remove as removeRule } from "./scry/remove";
import { update as updateRules } from "./scry/update";
import { add } from "./skills/add";
import { list } from "./skills/list";
import { update as updateSkills } from "./skills/update";
import { update } from "./update";

/** What webappwiz's commands are run with, on top of what any cli needs. */
export interface CommandDeps extends Deps {
	fs: Fs;
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
		.arg("dir", z.string(), {
			default: ".",
			description: "directory to scan recursively (default: .)",
		})
		.option("version", z.string(), {
			default: version,
			description: "version to pin to",
		})
		.action((opts, { log, fs }) => update({ ...opts, log, fs }));

	const scry = program
		.group("scry")
		.description("check a change against the rules in .wiz/scry, and keep them")
		.fallback("check");

	scry
		.command("check")
		.description("check a change against the rules, like a linter")
		.rest("paths", z.string(), {
			description: "check only changed files under these (default: all)",
		})
		.option("since", z.string(), {
			default: undefined,
			description:
				"git ref the change is measured from (default: the uncommitted work, else the branch since trunk)",
		})
		.option("jobs", z.coerce.number(), {
			default: undefined,
			description: "agent calls at once (default: scry.jobs, else 4)",
		})
		.option("format", z.enum(["text", "json"]), {
			default: "text",
			description: "text or json (default: text)",
		})
		.use(timed())
		.action((opts, { log, fs, ps }) => check({ ...opts, log, fs, ps }));

	scry
		.command("list")
		.description("list the rules there are, and what the project has of them")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs }) => listRules({ ...opts, log, fs }));

	scry
		.command("add")
		.description("copy shipped rules in: one by id, or every recommended one")
		.arg("rule", z.string(), {
			default: "",
			description:
				"rule id, as `scry list` names it; the project with --recommended",
		})
		.arg("dir", z.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.option(
			"recommended",
			z.string().transform((raw) => raw !== "false"),
			{
				default: false,
				description: "copy every rule that recommends itself, instead of one",
			},
		)
		.action((opts, { log, fs }) => addRule({ ...opts, log, fs }));

	scry
		.command("update")
		.description("refresh the shipped rules the project has copies of")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs }) => updateRules({ ...opts, log, fs }));

	scry
		.command("remove")
		.description("delete a rule from the project, scripts and all")
		.arg("rule", z.string(), {
			description: "rule id, as `scry list` names it",
		})
		.arg("dir", z.string(), {
			default: ".",
			description: "project to remove it from (default: .)",
		})
		.action((opts, { log, fs }) => removeRule({ ...opts, log, fs }));

	const skills = program
		.group("skills")
		.description("manage webappwiz agent skills in .agents/skills");

	skills
		.command("list")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs }) => list({ ...opts, log, fs }));

	skills
		.command("add")
		.description("add a skill to a project")
		.arg("skill", z.string(), { description: "skill name" })
		.arg("dir", z.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts, { log, fs }) => add({ ...opts, log, fs }));

	skills
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs }) => updateSkills({ ...opts, log, fs }));

	return program;
}

import { type Cli, cli, type Deps, timed } from "webappwiz/cmd";
import type { Fs } from "webappwiz/system";
import { z } from "zod";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { add as addCredential } from "./creds/add";
import { list as listCredentials } from "./creds/list";
import { remove as removeCredential } from "./creds/remove";
import { version } from "./package.json";
import { add as addRule } from "./scry/add";
import { check } from "./scry/check";
import { evaluate } from "./scry/eval";
import { list as listRules } from "./scry/list";
import { remove as removeRule } from "./scry/remove";
import { test as testRules } from "./scry/test";
import { update as updateRules } from "./scry/update";
import { why } from "./scry/why";
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
		.action((opts, { log, fs, ps }) => update({ ...opts, log, fs, ps }));

	const scry = program
		.group("scry")
		.description("check a change against the rules in .wiz/scry, and keep them")
		.fallback("check");

	scry
		.command("check")
		.description(
			"check a change, or every file under some paths, against the rules, like a linter",
		)
		.rest("paths", z.string(), {
			description:
				"check every file under these, changed or not (default: the change)",
		})
		.option("since", z.string(), {
			default: undefined,
			description:
				"check only files changed since this git ref (default with no paths: the uncommitted work, else the branch since trunk)",
		})
		.option("jobs", z.coerce.number(), {
			default: undefined,
			description: "requests to the model at once (default: scry.jobs, else 8)",
		})
		.option("model", z.string(), {
			default: undefined,
			description:
				"the model rules' deciders ask: clef, clef-flash, or a jev like jev-latest (default: scry.model, else clef)",
		})
		.option("format", z.enum(["text", "json"]), {
			default: "text",
			description: "text or json (default: text)",
		})
		.use(timed())
		.action((opts, { log, fs, ps }) => check({ ...opts, log, fs, ps }));

	scry
		.command("test")
		.description("run the tests beside each rule in .wiz/scry")
		.rest("ids", z.string(), {
			description: "rule ids, as `scry list` names them (default: every rule)",
		})
		.action((opts, { log, fs, ps }) => testRules({ ...opts, log, fs, ps }));

	scry
		.command("eval")
		.description(
			"score each rule on its labeled cases: its evals and its RULE.md examples",
		)
		.rest("ids", z.string(), {
			description: "rule ids, as `scry list` names them (default: every rule)",
		})
		.option("jobs", z.coerce.number(), {
			default: undefined,
			description: "requests to the model at once (default: scry.jobs, else 8)",
		})
		.option("model", z.string(), {
			default: undefined,
			description:
				"the model rules' deciders ask (default: scry.model, else clef)",
		})
		.option("format", z.enum(["text", "json"]), {
			default: "text",
			description: "text or json (default: text)",
		})
		.use(timed())
		.action((opts, { log, fs, ps }) => evaluate({ ...opts, log, fs, ps }));

	scry
		.command("why")
		.description(
			"say what a model was asked about a line, and what it answered",
		)
		.arg("at", z.string(), {
			description: "path:line, as a report prints it",
		})
		.action((opts, { log, fs, ps }) => why({ ...opts, log, fs, ps }));

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
		.option("recommended", z.boolean(), {
			default: false,
			description: "copy every rule that recommends itself, instead of one",
		})
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

	const credentials = program
		.group("creds")
		.description(
			"keep API keys in the system's secret store, out of files and agents' sight",
		)
		.fallback("list");

	credentials
		.command("list")
		.description(
			"list the credentials the project uses and where each comes from, never a value",
		)
		.action((_opts, { log, ps }) => listCredentials({ log, ps }));

	credentials
		.command("add")
		.description(
			"keep a credential's value, typed at a prompt that shows nothing",
		)
		.arg("name", z.string(), {
			description: "its environment variable name, as `creds list` shows it",
		})
		.option("stdin", z.boolean(), {
			default: false,
			description: "read the value piped in on stdin instead of asking",
		})
		.action((opts, { log, ps }) => addCredential({ ...opts, log, ps }));

	credentials
		.command("remove")
		.description("delete a credential's value from the store")
		.arg("name", z.string(), {
			description: "its environment variable name, as `creds list` shows it",
		})
		.action((opts, { log, ps }) => removeCredential({ ...opts, log, ps }));

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

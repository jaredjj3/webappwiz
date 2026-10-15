import { type Cli, cli, type Deps, timed } from "webappwiz/cmd";
import type { Fs } from "webappwiz/system";
import { z } from "zod";
// Every @webappwiz package is released in lockstep, so this one's version is
// the version of the packages to pin and of the skills bundled here. Imported
// rather than read, so declaring the commands needs no filesystem.
import { add as addCredential } from "./creds/add";
import { list as listCredentials } from "./creds/list";
import { remove as removeCredential } from "./creds/remove";
import { run as runWithCredentials } from "./creds/run";
import { version } from "./package.json";
import { add as addRule } from "./scry/add";
import {
	end as endRaise,
	pause as pauseBudget,
	raise as raiseBudget,
	reset as resetBudget,
	resume as resumeBudget,
	set as setBudget,
	show as showBudgets,
} from "./scry/budgets-commands";
import { check } from "./scry/check";
import { evaluate } from "./scry/eval";
import { list as listRules } from "./scry/list";
import { remove as removeRule } from "./scry/remove";
import { StderrScreen } from "./scry/screen";
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
		.description(
			"pin every webappwiz dependency in a tree to one version, then run `arbor update` and `scry update` at it",
		)
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
			"check every file under some paths, or only what changed, against the rules, like a linter",
		)
		.rest("paths", z.string(), {
			description:
				"check every file under these, changed or not (default: the working directory)",
		})
		.option("since", z.string(), {
			default: undefined,
			description:
				"check only the files changed since the branch left this git ref, committed or not",
		})
		.option("rule", z.string(), {
			default: "",
			description:
				"check with only these rules, comma separated, as `scry list` names them (default: every rule)",
		})
		.repeated("option", z.string(), {
			description:
				"set a rule's option for this run, as <rule>.<option>=<value>, like compact-files.limit=400, over scry.rules; give it again for another",
		})
		.option("jobs", z.coerce.number(), {
			default: undefined,
			description: "requests to the model at once (default: scry.jobs, else 8)",
		})
		.option("profile", z.string(), {
			default: undefined,
			description:
				"one of scry.profiles, whose models lay over scry.models for this run",
		})
		.option("format", z.enum(["text", "json"]), {
			default: "text",
			description: "text or json (default: text)",
		})
		.option("cost", z.boolean(), {
			default: false,
			description:
				"estimate the input tokens the check would spend, and what it would leave of each budget, without asking a model, instead of checking",
		})
		.option("override-budget", z.boolean(), {
			default: false,
			description:
				"check even past scry.budgets, or with none declared, spending without a limit",
		})
		.option("disable-over-budget", z.boolean(), {
			default: false,
			description:
				"turn off each model scry.budgets no longer covers, as --disable would, rather than refuse to run: one with no budget declared, nothing to spend, or less left than the check would use",
		})
		.repeated(
			"disable",
			z
				.string()
				.regex(
					/^(som|llm)(=.+)?$/,
					"expected som or llm, then =<reason> if you like",
				),
			{
				description:
					"turn off a model for this run, as som or llm, with =<reason> to say why, like llm=saving tokens; give it again for the other, which checks only what code decides and needs no budget; rules that would ask it are listed with the reason, not checked",
			},
		)
		.use(timed())
		.action(
			(
				{
					rule,
					option,
					"override-budget": overrideBudget,
					"disable-over-budget": disableOverBudget,
					disable,
					...opts
				},
				{ log, fs, ps },
			) =>
				check({
					...opts,
					overrideBudget,
					disableOverBudget,
					disabled: Object.fromEntries(
						disable.map((flag) => {
							const [role, ...reason] = flag.split("=");
							return [
								role,
								reason.length === 0
									? `${role} disabled with --disable`
									: reason.join("="),
							];
						}),
					),
					rules: rule.split(",").filter((id) => id !== ""),
					options: option,
					log,
					fs,
					ps,
					screen: new StderrScreen(ps),
				}),
		);

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
		.repeated("option", z.string(), {
			description:
				"set a rule's option for this run, as <rule>.<option>=<value>, like compact-files.limit=400, over scry.rules; give it again for another",
		})
		.option("jobs", z.coerce.number(), {
			default: undefined,
			description: "requests to the model at once (default: scry.jobs, else 8)",
		})
		.option("profile", z.string(), {
			default: undefined,
			description:
				"one of scry.profiles, whose models lay over scry.models for this run",
		})
		.option("format", z.enum(["text", "json"]), {
			default: "text",
			description: "text or json (default: text)",
		})
		.option("override-budget", z.boolean(), {
			default: false,
			description:
				"score even past scry.budgets, or with none declared, spending without a limit",
		})
		.use(timed())
		.action(
			(
				{ option, "override-budget": overrideBudget, ...opts },
				{ log, fs, ps },
			) =>
				evaluate({
					...opts,
					overrideBudget,
					options: option,
					log,
					fs,
					ps,
					screen: new StderrScreen(ps),
				}),
		);

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
		.description(
			"bring the project up to this release of scry: move what older ones left behind, like the scry key of .wiz/config.ts into scry.config.ts, then refresh the shipped rules it has copies of, and the scry skill",
		)
		.arg("dir", z.string(), {
			default: ".",
			description: "project to update (default: .)",
		})
		.action((opts, { log, fs, ps }) => updateRules({ ...opts, log, fs, ps }));

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

	const budgets = scry
		.group("budgets")
		.description(
			"show and change what checks may spend on each model in this project, on this device",
		)
		.fallback("show");

	const format = [
		"format",
		z.enum(["text", "json"]),
		{ default: "text", description: "text or json (default: text)" },
	] as const;

	budgets
		.command("show")
		.description(
			"show what each model may spend, what it has spent of each window, and the raises on it",
		)
		.option(...format)
		.action((opts, { log, fs, ps }) => showBudgets({ ...opts, log, fs, ps }));

	budgets
		.command("set")
		.description(
			"set what a model may spend in this project, over scry.budgets in the configs",
		)
		.arg("role", z.string(), { description: "som or llm" })
		.arg("spend", z.string(), {
			description:
				"nothing, unlimited, or limits joined by commas, each tokens over a window, like 5m/day or 2m/month,300k/7d",
		})
		.option(...format)
		.action((opts, { log, fs, ps }) => setBudget({ ...opts, log, fs, ps }));

	budgets
		.command("reset")
		.description("give a model's budget back to scry.budgets in the configs")
		.arg("role", z.string(), { description: "som or llm" })
		.option(...format)
		.action((opts, { log, fs, ps }) => resetBudget({ ...opts, log, fs, ps }));

	budgets
		.command("raise")
		.description(
			"add tokens to each of a model's limits for a while, like 2m for 1d",
		)
		.arg("role", z.string(), { description: "som or llm" })
		.arg("tokens", z.string(), { description: "like 300k or 2m" })
		.option("for", z.string(), {
			default: "1d",
			description:
				'how long, in hours, days or weeks, like "4h" or "2d" (default: 1d)',
		})
		.option(...format)
		.action((opts, { log, fs, ps }) => raiseBudget({ ...opts, log, fs, ps }));

	budgets
		.command("pause")
		.description("stop a model asking anything for a while, like 1d")
		.arg("role", z.string(), { description: "som or llm" })
		.option("for", z.string(), {
			default: "1d",
			description:
				'how long, in hours, days or weeks, like "4h" or "2d" (default: 1d)',
		})
		.option(...format)
		.action((opts, { log, fs, ps }) => pauseBudget({ ...opts, log, fs, ps }));

	budgets
		.command("resume")
		.description("let a paused model ask again before its pause ends")
		.arg("role", z.string(), { description: "som or llm" })
		.option(...format)
		.action((opts, { log, fs, ps }) => resumeBudget({ ...opts, log, fs, ps }));

	budgets
		.command("end")
		.description("end a raise before its time")
		.arg("id", z.coerce.number(), {
			description: "its number, as `scry budgets` lists it",
		})
		.option(...format)
		.action((opts, { log, fs, ps }) => endRaise({ ...opts, log, fs, ps }));

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
		.option("device", z.boolean(), {
			default: false,
			description:
				"keep it for every project on this device, not just this one",
		})
		.action((opts, { log, ps }) => addCredential({ ...opts, log, ps }));

	credentials
		.command("remove")
		.description("delete a credential's value from the store")
		.arg("name", z.string(), {
			description: "its environment variable name, as `creds list` shows it",
		})
		.option("device", z.boolean(), {
			default: false,
			description: "delete it from the device's store, not the project's",
		})
		.action((opts, { log, ps }) => removeCredential({ ...opts, log, ps }));

	credentials
		.command("run")
		.description(
			"run a command with the project's stored credentials in its environment, for that run only",
		)
		.rest("command", z.string(), {
			description: "the command and its arguments, after a `--`",
		})
		.passThroughOptions()
		.allowUnknownOption()
		.action((opts, { log, ps }) => runWithCredentials({ ...opts, log, ps }));

	const skills = program
		.group("skills")
		.description(
			"manage webappwiz agent skills in .agents/skills, installed with `bunx skills add` from this release's tag",
		);

	skills
		.command("list")
		.description("list the skills there are, and what the project has of them")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to inspect (default: .)",
		})
		.action((opts, { log, fs, ps }) => list({ ...opts, log, fs, ps }));

	skills
		.command("add")
		.description("add a skill to a project")
		.arg("skill", z.string(), { description: "skill name" })
		.arg("dir", z.string(), {
			default: ".",
			description: "project to add it to (default: .)",
		})
		.action((opts, { log, fs, ps }) => add({ ...opts, log, fs, ps }));

	skills
		.command("update")
		.description("refresh the skills a project already has")
		.arg("dir", z.string(), {
			default: ".",
			description: "project to refresh (default: .)",
		})
		.action((opts, { log, fs, ps }) => updateSkills({ ...opts, log, fs, ps }));

	return program;
}

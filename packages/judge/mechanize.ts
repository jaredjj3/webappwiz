import type { Logger } from "@webappwiz/log";
import { MarkdownWriter } from "@webappwiz/md";
import type { Agent } from "@webappwiz/rules";
import type { Ps } from "@webappwiz/sys";
import type { ConfigDiagnostic } from "./diagnostic";
import type { Rule } from "./rule/rule";

/**
 * Finds the rules in a config that do not need an agent, because a formatter,
 * linter, type checker or grep would enforce them outright. An agent run costs
 * minutes and tokens and is only ever a judgment call, so a rule a tool can
 * decide belongs to the tool.
 */
export class Mechanizer {
	// Asking an agent which rules do not need an agent is not the joke it looks
	// like: the question is itself a judgment, and answering it once at audit
	// time is far cheaper than a rule that runs an agent over every file forever.

	constructor(
		private log: Logger,
		private ps: Ps,
	) {}

	/**
	 * One warning per rule a tool could take over, naming the tool. Rules that
	 * genuinely need reading comprehension produce nothing.
	 */
	async check(rules: Rule[], agent: Agent): Promise<ConfigDiagnostic[]> {
		const found = await Promise.all(rules.map((rule) => this.ask(rule, agent)));
		return found.filter((diagnostic) => diagnostic !== null);
	}

	private async ask(
		rule: Rule,
		agent: Agent,
	): Promise<ConfigDiagnostic | null> {
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture([
			...agent.argv,
			this.prompt(rule),
		]);
		if (exitCode !== 0) {
			this.log.error(
				`agent exited ${exitCode} on rule "${rule.id}": ${stderr.trim() || "no stderr"}`,
			);
			return null;
		}
		const answer = parse(stdout);
		if (answer === null) {
			this.log.error(
				`agent returned no JSON object on rule "${rule.id}": ${stdout.trim().slice(0, 200)}`,
			);
			return null;
		}
		if (answer.tool === null) {
			return null;
		}
		return {
			rule: rule.id,
			severity: "warning",
			message:
				`${answer.tool} could enforce this without an agent` +
				(answer.reason ? `: ${answer.reason}` : ""),
		};
	}

	prompt(rule: Rule): string {
		return new MarkdownWriter()
			.text(
				"You are triaging one rule from a rule set that is judged by AI " +
					"agents. An agent run is slow and expensive and can only ever " +
					"judge, so a rule an ordinary tool could enforce should not be an " +
					"agent's job at all. Decide which this rule is.",
			)
			.text("The rule, verbatim:")
			.code("markdown", rule.document)
			.text(
				[
					"A tool can take this rule over only if it decides every case the " +
						"rule covers, including the exceptions the rule carves out, from " +
						"the text of the code alone. Consider a formatter (prettier, " +
						"biome format), a linter (biome, eslint, clippy, ruff), the type " +
						"checker, and a plain grep or regex.",
					"",
					"Deciding a case means finding what to fix, not prescribing the " +
						"fix. The agent you are replacing reports the code that breaks " +
						"the rule and stops there, so a rule whose violations a pattern " +
						"finds outright belongs to the tool even when repairing one takes " +
						"judgment. Weigh only the part of the document that says what " +
						"counts as a violation.",
					"",
					"Answer with the tool only if you could name the concrete check: the " +
						"lint rule, the formatter setting, the pattern to grep for. If a " +
						"tool would handle the common case but miss or misfire on an " +
						"exception, that is not enough, and the answer is null.",
					"",
					"A rule needs an agent when applying it means reading what the code " +
						"means: whether a comment says something the code already says, " +
						"whether a name describes what a function does, whether prose " +
						"addresses the reader. No pattern decides those.",
				].join("\n"),
			)
			.text(
				[
					"Output one JSON object and nothing else:",
					"",
					'{"tool": "<what would enforce it>", "reason": "<the concrete check it would run>"}',
					"",
					'Use {"tool": null} when the rule needs an agent.',
					"",
					'"reason" is one clause, lowercase, no trailing period. Name the ' +
						"check, not the outcome, in words a reader can say aloud: " +
						'write "a regex for em dashes outside code fences", never a ' +
						'codepoint like "U+2014", and not "it would find the em dashes".',
				].join("\n"),
			)
			.toString();
	}
}

/**
 * Agents wrap an answer in prose or a fence often enough that finding the
 * outermost braces beats insisting the whole of stdout parse.
 */
function parse(stdout: string): { tool: string | null; reason: string } | null {
	const start = stdout.indexOf("{");
	const end = stdout.lastIndexOf("}");
	if (start === -1 || end < start) {
		return null;
	}
	let value: unknown;
	try {
		value = JSON.parse(stdout.slice(start, end + 1));
	} catch {
		return null;
	}
	if (typeof value !== "object" || value === null || !("tool" in value)) {
		return null;
	}
	if (value.tool === null) {
		return { tool: null, reason: "" };
	}
	if (typeof value.tool !== "string") {
		return null;
	}
	const reason =
		"reason" in value && typeof value.reason === "string" ? value.reason : "";
	return { tool: value.tool, reason };
}

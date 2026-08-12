import { color, type Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";
import { DEFAULT_GUIDE } from "./guide";
import { Guides } from "./guides";
import { Linter } from "./linter";
import type { Rule } from "./rule/rule";

/**
 * Lints every git-tracked file a rule's glob wants and reports one line per
 * finding, `path:line:column rule message`. Only rules with checks run here;
 * the agent-judged rest of the guide is `analyze`'s job, on demand.
 */
export class Lint {
	constructor(
		private readonly log: Logger,
		private readonly fs: Fs,
		private readonly ps: Ps,
		private readonly rules?: Rule[],
	) {}

	/** True when no rule reported an error. */
	async run(): Promise<boolean> {
		const rules = this.rules ?? (await this.guide());
		if (rules === null) {
			return false;
		}
		const listed = await this.ps.spawnCapture(["git", "ls-files"]);
		if (listed.exitCode !== 0) {
			throw new Error("git ls-files failed: lint runs in a git repository");
		}
		const linter = new Linter(rules);
		const paths = listed.stdout
			.split("\n")
			.filter((path) => path !== "" && linter.matches(path));
		const files = await Promise.all(
			paths.map(async (path) => ({ path, text: await this.fs.read(path) })),
		);
		const diagnostics = linter.lint(files);
		for (const diagnostic of diagnostics) {
			const paint = diagnostic.severity === "error" ? color.red : color.yellow;
			this.log.info(
				`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${paint(diagnostic.rule)} ${diagnostic.message}`,
			);
		}
		return !diagnostics.some((diagnostic) => diagnostic.severity === "error");
	}

	/** The project's rules, or null after reporting a guide that will not
	 * compile: broken rules failing the run is how their author finds out. */
	private async guide(): Promise<Rule[] | null> {
		const { rules, diagnostics } = await new Guides(this.fs).project();
		let errors = false;
		for (const diagnostic of diagnostics.filter(
			(diagnostic) => diagnostic.severity === "error",
		)) {
			errors = true;
			const at =
				diagnostic.line === undefined
					? diagnostic.rule
					: `${diagnostic.rule}:${diagnostic.line}`;
			this.log.info(`${at} ${color.red(DEFAULT_GUIDE)} ${diagnostic.message}`);
		}
		return errors ? null : rules;
	}
}

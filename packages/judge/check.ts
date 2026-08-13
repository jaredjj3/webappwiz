import { color, type Logger } from "@webappwiz/log";
import { DEFAULT_CONFIG } from "@webappwiz/rules";
import type { Fs, Glob, Ps } from "@webappwiz/sys";
import { Checker } from "./checker";
import { Configs } from "./configs";
import type { Rule } from "./rule/rule";

/**
 * Checks every git-tracked file a rule's glob wants and reports one line per
 * finding, `path:line:column rule message`. Only rules with checks run here;
 * the agent-judged rest of the config is `judge`'s job, on demand.
 */
export class Check {
	constructor(
		private readonly log: Logger,
		private readonly fs: Fs,
		private readonly ps: Ps,
		private readonly glob: Glob,
		private readonly rules?: Rule[],
	) {}

	/** True when no rule reported an error. */
	async run(): Promise<boolean> {
		const rules = this.rules ?? (await this.config());
		if (rules === null) {
			return false;
		}
		const listed = await this.ps.spawnCapture(["git", "ls-files"]);
		if (listed.exitCode !== 0) {
			throw new Error("git ls-files failed: checks run in a git repository");
		}
		const checker = new Checker(rules, this.glob);
		const paths = listed.stdout
			.split("\n")
			.filter((path) => path !== "" && checker.matches(path));
		const files = await Promise.all(
			paths.map(async (path) => ({ path, text: await this.fs.read(path) })),
		);
		const diagnostics = checker.check(files);
		for (const diagnostic of diagnostics) {
			const paint = diagnostic.severity === "error" ? color.red : color.yellow;
			this.log.info(
				`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${paint(diagnostic.rule)} ${diagnostic.message}`,
			);
		}
		return !diagnostics.some((diagnostic) => diagnostic.severity === "error");
	}

	/** The project's rules, or null after reporting a config that will not
	 * compile: broken rules failing the run is how their author finds out. */
	private async config(): Promise<Rule[] | null> {
		const { config, diagnostics } = await new Configs().load();
		let errors = false;
		for (const diagnostic of diagnostics.filter(
			(diagnostic) => diagnostic.severity === "error",
		)) {
			errors = true;
			const at =
				diagnostic.line === undefined
					? diagnostic.rule
					: `${diagnostic.rule}:${diagnostic.line}`;
			this.log.info(`${at} ${color.red(DEFAULT_CONFIG)} ${diagnostic.message}`);
		}
		return errors ? null : config.rules;
	}
}

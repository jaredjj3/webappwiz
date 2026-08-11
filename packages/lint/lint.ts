import { color, type Logger } from "@webappwiz/log";
import type { Fs, Ps } from "@webappwiz/sys";
import { Linter } from "./linter";
import type { Rule } from "./rule";
import { recommended } from "./rules";

/**
 * Lints every git-tracked file a rule's glob wants and reports one line per
 * finding, `path:line:column rule message`.
 */
export class Lint {
	constructor(
		private readonly log: Logger,
		private readonly fs: Fs,
		private readonly ps: Ps,
		private readonly rules: Rule[] = recommended,
	) {}

	/** True when no rule reported an error. */
	async run(): Promise<boolean> {
		const listed = await this.ps.spawnCapture(["git", "ls-files"]);
		if (listed.exitCode !== 0) {
			throw new Error("git ls-files failed: lint runs in a git repository");
		}
		const linter = new Linter(this.rules);
		const paths = listed.stdout
			.split("\n")
			.filter((path) => path !== "" && linter.matches(path));
		const files = await Promise.all(
			paths.map(async (path) => ({ path, text: await this.fs.read(path) })),
		);
		const diagnostics = linter.lint(files);
		for (const d of diagnostics) {
			const paint = d.severity === "error" ? color.red : color.yellow;
			this.log.info(
				`${d.path}:${d.line}:${d.column} ${paint(d.rule)} ${d.message}`,
			);
		}
		return !diagnostics.some((d) => d.severity === "error");
	}
}

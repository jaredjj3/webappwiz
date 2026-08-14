import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "@webappwiz/sys";
import { Checker } from "./checker";
import type { FileRule } from "./rule";

/**
 * Checks every git-tracked file a rule's glob wants and reports one line per
 * finding, `path:line:column rule message`. Only the free half runs here:
 * what the checks escalate is `wiz judge`'s job, on demand.
 */
export class Check {
	private readonly log: Logger;
	private readonly fs: Fs;
	private readonly ps: Ps;
	private readonly glob: Glob;

	constructor(
		private readonly rules: FileRule[],
		log?: Logger,
		fs?: Fs,
		ps?: Ps,
		glob?: Glob,
	) {
		this.log = log ?? new ConsoleLogger();
		this.fs = fs ?? new NodeFs();
		this.ps = ps ?? new NodePs();
		this.glob = glob ?? new NodeGlob();
	}

	/** True when no rule reported an error. */
	async run(): Promise<boolean> {
		const listed = await this.ps.spawnCapture(["git", "ls-files"]);
		if (listed.exitCode !== 0) {
			throw new Error("git ls-files failed: checks run in a git repository");
		}
		const checker = new Checker(this.rules, this.glob);
		const paths = listed.stdout
			.split("\n")
			.filter((path) => path !== "" && checker.matches(path));
		const files = await Promise.all(
			paths.map(async (path) => ({ path, text: await this.fs.read(path) })),
		);
		const { diagnostics } = checker.check(files);
		for (const diagnostic of diagnostics) {
			const paint = diagnostic.severity === "error" ? color.red : color.yellow;
			this.log.info(
				`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} ${paint(diagnostic.rule)} ${diagnostic.message}`,
			);
		}
		return !diagnostics.some((diagnostic) => diagnostic.severity === "error");
	}
}

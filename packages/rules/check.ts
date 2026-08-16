import { ConsoleLogger, color, type Logger } from "@webappwiz/log";
import {
	type Fs,
	type Glob,
	NodeFs,
	NodeGlob,
	NodePs,
	type Ps,
} from "@webappwiz/system";
import { Checker } from "./checker";
import type { FileRule } from "./rule";

/**
 * Checks every git-tracked file a rule's glob wants and reports one line per
 * finding, `path:line:column rule message`. Only the free half runs here:
 * what the checks escalate is an agent's job, on demand.
 */
/** What a `Check` runs through; the real ones by default. */
export interface CheckOptions {
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
	glob?: Glob;
}

export class Check {
	private readonly log: Logger;
	private readonly fs: Fs;
	private readonly ps: Ps;
	private readonly glob: Glob;

	constructor(
		private readonly rules: FileRule[],
		opts: CheckOptions = {},
	) {
		this.log = opts.log ?? new ConsoleLogger();
		this.fs = opts.fs ?? new NodeFs();
		this.ps = opts.ps ?? new NodePs();
		this.glob = opts.glob ?? new NodeGlob();
	}

	/** True when no rule reported an error. */
	async run(): Promise<boolean> {
		const listed = await this.ps.spawnCapture(["git", "ls-files"]);
		if (listed.exitCode !== 0) {
			throw new Error("git ls-files failed: checks run in a git repository");
		}
		const checker = new Checker(this.rules, { glob: this.glob });
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

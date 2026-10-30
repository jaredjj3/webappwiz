import { basename } from "node:path";
import { NodePs, type Ps } from "webappwiz/system";
import { CliGit } from "../git/cli-git";
import type { Git } from "../git/git";
import { CliWorkflows } from "../github/cli-workflows";
import type { Workflows } from "../github/workflows";
import { PUBLISH_WORKFLOW_PATH } from "../publish-workflow";
import type { CheckReport } from "../step";

/** How many lines of a failed run's log an error carries. */
const LOG_LINES = 20;

/** Pass `git` or `workflows` to run `GithubActions` against fakes in tests; the real ones by default. */
export interface GithubActionsOptions {
	git?: Git;
	workflows?: Workflows;
	ps?: Ps;
}

/** Use it as `releases.npm`'s `via`: `githubActions()` makes one. */
export function githubActions(opts: GithubActionsOptions = {}): GithubActions {
	return new GithubActions(opts);
}

/**
 * Publishes by running the generated publish workflow on GitHub Actions, where
 * npm trusts the job, rather than from this machine. It pushes the release
 * commit, starts the workflow on it, and follows the run; whether a version
 * went out is still the registry's to say, never the run's green check.
 *
 * A release has one run for all its packages, found again by its commit: a
 * second package reuses it, and a resumed release reuses a run still going or
 * finished, and reruns one that failed.
 */
export class GithubActions {
	private readonly git: Git;
	private readonly workflows: Workflows;
	/** The attempt of the run a rerun started from, whose result is stale until a newer one shows. */
	private rerunFrom?: { id: string; attempt: number };

	constructor(opts: GithubActionsOptions = {}) {
		const ps = opts.ps ?? new NodePs();
		this.git = opts.git ?? new CliGit(ps.cwd(), { ps });
		this.workflows = opts.workflows ?? new CliWorkflows({ ps });
	}

	/**
	 * Gets a run going for the release commit: pushes the branch so GitHub has
	 * the commit, then starts the workflow, reruns its failed run, or leaves
	 * the run it has alone. Returns once that is asked, not once it ends.
	 */
	async start(): Promise<void> {
		const branch = await this.git.branch();
		await this.git.push(branch);
		const sha = await this.git.head();
		const [latest] = await this.workflows.runs(file(), sha);
		if (latest === undefined) {
			await this.workflows.dispatch(file(), branch, { ref: sha });
			return;
		}
		if (latest.status === "completed" && latest.conclusion !== "success") {
			this.rerunFrom = { id: latest.id, attempt: latest.attempt };
			// A cancelled or timed out run left jobs unrun that a failed-only
			// rerun would skip.
			await this.workflows.rerun(latest.id, latest.conclusion === "failure");
		}
	}

	/**
	 * Where the run stands, as a step check reads it: passed once it succeeded,
	 * throwing when it ended any other way, and otherwise its status and page.
	 * `live` says whether the registry already serves the package, which is
	 * all that passes a release that never started a run.
	 */
	async watch(name: string, live: boolean): Promise<CheckReport> {
		const [run] = await this.workflows.runs(file(), await this.git.head());
		if (run === undefined) {
			return live ? { passed: true } : { passed: false, status: "waiting" };
		}
		const { url } = run;
		if (run.status !== "completed") {
			return { passed: false, status: run.status, url };
		}
		if (
			this.rerunFrom?.id === run.id &&
			run.attempt <= this.rerunFrom.attempt
		) {
			// GitHub still shows the attempt that failed.
			return { passed: false, status: "queued", url };
		}
		if (run.conclusion === "success") {
			return { passed: true, url };
		}
		throw new Error(await this.failure(name, run.id, url, run.conclusion));
	}

	private async failure(
		name: string,
		id: string,
		url: string,
		conclusion: string | undefined,
	): Promise<string> {
		const log = await this.workflows.failedLog(id);
		const tail = log.split("\n").slice(-LOG_LINES).join("\n");
		const refused = /OIDC token exchange/i.test(log)
			? `\n${await this.setup(name)}`
			: "";
		return `the publish run ${conclusion ?? "ended"}: ${url}\n${tail}${refused}`;
	}

	/** What to enter on npmjs.com for npm to trust the workflow, once per package. */
	private async setup(name: string): Promise<string> {
		const repo = await this.workflows.repo();
		return [
			`npm refused the run: ${name} has no trusted publisher entry for it. On npmjs.com, open the package's Settings, then Trusted Publisher, and choose GitHub Actions:`,
			`  repository:  ${repo}`,
			`  workflow:    ${file()}`,
			`  environment: (blank)`,
			`  publishing:  allow direct publish`,
			"The package must already exist. A new entry lapses after about two days unless a publish uses it. Then ship again to rerun the failed run.",
		].join("\n");
	}
}

function file(): string {
	return basename(PUBLISH_WORKFLOW_PATH);
}

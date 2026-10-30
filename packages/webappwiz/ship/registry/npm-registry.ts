import { NodePs, type Ps } from "webappwiz/system";
import type { Publication, Registry } from "./registry";

/** Pass `ps` to run `NpmRegistry`'s npm commands through a fake in tests; the real processes by default. */
export interface NpmRegistryOptions {
	ps?: Ps;
	/**
	 * Publish as npm's trusted publishing wants it, from a CI job that npm
	 * trusts: a plain `npm publish` that npm authorizes from the job's OIDC
	 * identity, with no token, no login and no stage. `trusted()` makes one.
	 */
	trusted?: boolean;
}

/**
 * Use it to stage packages on npm and read back what npm holds. A stage-only
 * token will do, and a person approves each version on npmjs.com; npm then
 * scans it, typically for about five minutes, before anyone can install it.
 */
// Staging needs no 2FA, which is what lets a stage-only token publish.
export class NpmRegistry implements Registry {
	readonly staged: boolean;
	readonly scans = true;
	private readonly ps: Ps;
	private readonly isTrusted: boolean;
	private authed?: Promise<void>;

	constructor(opts: NpmRegistryOptions = {}) {
		this.ps = opts.ps ?? new NodePs();
		this.isTrusted = opts.trusted === true;
		this.staged = !this.isTrusted;
	}

	trusted(): Registry {
		return new NpmRegistry({ ps: this.ps, trusted: true });
	}

	async published(name: string, version: string): Promise<boolean> {
		const { exitCode, stdout } = await this.ps.spawnCapture([
			"npm",
			"view",
			`${name}@${version}`,
			"version",
		]);
		// A name nobody has published fails outright, but a known name missing
		// this one version succeeds and says nothing, so the output decides.
		// A version npm is still scanning reads as missing too.
		return exitCode === 0 && stdout.trim() !== "";
	}

	async deployed(name: string): Promise<string | undefined> {
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture([
			"npm",
			"view",
			name,
			"dist-tags.latest",
		]);
		if (exitCode === 0) {
			return stdout.trim() || undefined;
		}
		// A name nobody has published is a 404, which is an answer: nothing yet.
		if (stderr.includes("E404")) {
			return undefined;
		}
		throw new Error(`npm view ${name}: ${stderr.trim() || stdout.trim()}`);
	}

	async publish(dir: string): Promise<Publication> {
		if (this.isTrusted) {
			return this.publishTrusted(dir);
		}
		this.authed ??= this.checkVersion().then(() => this.login());
		await this.authed;
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(
			["npm", "stage", "publish", "--access", "public"],
			{ cwd: dir },
		);
		if (exitCode !== 0) {
			// npm refuses a version it took, even one `npm view` cannot see yet
			// while it scans, so a rerun after a lost run lands here.
			if (/E409|previously published/i.test(`${stdout}\n${stderr}`)) {
				return { already: true };
			}
			throw new Error(
				`stage publish failed in ${dir}: ${stderr.trim() || stdout.trim()}`,
			);
		}
		const found = /\+ (\S+)@[^@\s]+ \(staged with id ([^)\s]+)\)/.exec(
			`${stdout}\n${stderr}`,
		);
		if (found?.[1] === undefined || found[2] === undefined) {
			throw new Error(`npm staged ${dir} but printed no stage id`);
		}
		// npm documents no URL for one staged version; its Staged Packages tab
		// sits on the package page.
		return {
			staged: {
				stageId: found[2],
				url: `https://www.npmjs.com/package/${found[1]}`,
			},
		};
	}

	/**
	 * `npm publish` from a job npm trusts. Verbose, because a package with no
	 * matching trusted publisher entry fails with the same 404 as a logged-out
	 * publish, and only the verbose log says the OIDC exchange is what refused.
	 */
	private async publishTrusted(dir: string): Promise<Publication> {
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(
			["npm", "publish", "--access", "public", "--loglevel", "verbose"],
			{ cwd: dir },
		);
		if (exitCode === 0) {
			return {};
		}
		const output = `${stdout}\n${stderr}`;
		if (/E409|previously published/i.test(output)) {
			return { already: true };
		}
		if (/OIDC token exchange error/i.test(output)) {
			throw new Error(
				`npm refused the OIDC token exchange for ${dir}: the package has no trusted publisher entry naming this repository and workflow, or it does not exist yet`,
			);
		}
		throw new Error(
			`publish failed in ${dir}: ${stderr.trim() || stdout.trim()}`,
		);
	}

	page(name: string, version: string): string {
		return `https://www.npmjs.com/package/${name}/v/${version}`;
	}

	/** `npm stage` arrived in npm 11.15; older CLIs die with a bare "Unknown command". */
	private async checkVersion(): Promise<void> {
		const { stdout } = await this.ps.spawnCapture(["npm", "--version"]);
		const found = /^(\d+)\.(\d+)/.exec(stdout.trim());
		if (!found) {
			return;
		}
		const [major, minor] = [Number(found[1]), Number(found[2])];
		if (major < 11 || (major === 11 && minor < 15)) {
			throw new Error(
				`npm ${stdout.trim()} cannot stage packages: npm 11.15 or newer is required (npm install -g npm@latest)`,
			);
		}
	}

	/** Runs `npm login` unless somebody is already logged in. NPM_TOKEN counts. */
	private async login(): Promise<void> {
		if ((await this.ps.spawnCapture(["npm", "whoami"])).exitCode === 0) {
			return;
		}
		// `npm login` reads from a human, though the web flow only prints a link. CI is where there is none, and where it
		// would sit waiting rather than failing, so say what to set instead.
		if (this.ps.env("CI") !== undefined) {
			throw new Error("not logged in to npm: set NPM_TOKEN");
		}
		const { exitCode } = await this.ps.spawn([
			"npm",
			"login",
			"--auth-type=web",
		]);
		if (exitCode !== 0) {
			throw new Error("npm login failed");
		}
	}
}

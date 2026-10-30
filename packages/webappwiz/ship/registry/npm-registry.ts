import { NodePs, type Ps } from "webappwiz/system";
import type { Registry, StagedPackage } from "./registry";

/** The processes `NpmRegistry` spawns through; the real ones by default. */
export interface NpmRegistryOptions {
	ps?: Ps;
}

/**
 * Stages packages on npm and reads back what it holds. Staging needs no 2FA,
 * so a stage-only token will do; a person approves each version on npmjs.com.
 */
export class NpmRegistry implements Registry {
	readonly staged = true;
	private readonly ps: Ps;
	private authed?: Promise<void>;

	constructor(opts: NpmRegistryOptions = {}) {
		this.ps = opts.ps ?? new NodePs();
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

	async publish(dir: string): Promise<StagedPackage> {
		this.authed ??= this.login();
		await this.authed;
		const { exitCode, stdout, stderr } = await this.ps.spawnCapture(
			["npm", "stage", "publish", "--access", "public"],
			{ cwd: dir },
		);
		if (exitCode !== 0) {
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
			stageId: found[2],
			url: `https://www.npmjs.com/package/${found[1]}`,
		};
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

import type { Logger } from "@webappwiz/log";
import { type Fs, NodePs, type Ps } from "@webappwiz/system";
import { CliGit } from "../git/cli-git";
import { CliGithub, type CliGithubOptions } from "../github/cli-github";
import type { Github } from "../github/github";
import type { Plan } from "../plan";
import { NpmRegistry, type NpmRegistryOptions } from "../registry/npm-registry";
import type { Registry } from "../registry/registry";
import type { Bump } from "../version";
import { ManifestWorkspace } from "../workspace/manifest-workspace";
import { LockstepShip } from "./lockstep-ship";

/**
 * Releases every declared target in a workspace together, at one version.
 *
 * Ask `plan` what a release would do, show that to whoever is deciding, then
 * hand the plan back to `run`.
 */
export interface Ship {
	plan(type: Bump): Promise<Plan>;
	/**
	 * Carries out `plan`, having checked that it still holds. Run it again after
	 * a failure: everything that already landed is skipped, so a second run
	 * finishes the release rather than starting a new one.
	 */
	run(plan: Plan): Promise<void>;
}

/** One package a release publishes, and the registry that carries it. */
export interface Target {
	name: string;
	registry: Registry;
}

/**
 * Declares what a repository ships: name each package and where it goes, then
 * compose the declarations with `lockstep`.
 *
 * ```ts
 * const release = Ship.lockstep(
 * 	Ship.npm("@scope/foo"),
 * 	Ship.custom("@scope/baz", new S3Registry()),
 * 	Ship.github(),
 * );
 * ```
 */
export const Ship = {
	/** A package the npm registry carries. */
	npm(name: string, opts: NpmRegistryOptions = {}): Target {
		return { name, registry: new NpmRegistry(opts) };
	},

	/** A package `registry` carries, for wherever npm is not the answer. */
	custom(name: string, registry: Registry): Target {
		return { name, registry };
	},

	/** The release-level step that publishes GitHub release notes for the tag. */
	github(opts: CliGithubOptions = {}): Github {
		return new CliGithub(opts);
	},

	/** Releases every declared target together, at one version. */
	lockstep(...parts: Array<Target | Github>): Ship {
		return new LockstepShip(
			parts.filter((part): part is Target => "registry" in part),
			{ github: parts.find((part): part is Github => "release" in part) },
		);
	},

	/**
	 * The workspace's own release: every public package around the working
	 * directory onto npm, with GitHub release notes. This is what `wiz ship`
	 * runs when nothing declares otherwise.
	 */
	async workspace(opts: WorkspaceShipOptions = {}): Promise<Ship> {
		const ps = opts.ps ?? new NodePs();
		const workspace = await ManifestWorkspace.at(ps.cwd(), { fs: opts.fs });
		const registry = new NpmRegistry({ ps });
		const targets = (await workspace.packages())
			.filter((pkg) => !pkg.private)
			.map((pkg) => ({ name: pkg.name, registry }));
		return new LockstepShip(targets, {
			workspace,
			git: new CliGit(workspace.root, { ps }),
			github: new CliGithub({ ps }),
			log: opts.log,
		});
	},
};

/** What `Ship.workspace` releases through; the real system by default. */
export interface WorkspaceShipOptions {
	log?: Logger;
	fs?: Fs;
	ps?: Ps;
}

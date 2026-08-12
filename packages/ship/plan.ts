import type { Bump } from "./version";

/** One workspace package, as a release sees it. */
export interface Package {
	name: string;
	/** The directory holding its package.json. */
	dir: string;
	/** Private packages still get the version stamp; they just never go out. */
	private: boolean;
	/** Whether the registry already has this package at the plan's version. */
	published: boolean;
}

export type ProblemKind = "dirty" | "branch" | "empty" | "npm-auth" | "gh-auth";

/** Something standing between you and a release. */
export interface Problem {
	kind: ProblemKind;
	message: string;
	/**
	 * A command that clears this problem, when one exists. Run it only where a
	 * human can answer it: `npm login` and `gh auth login` want a terminal, and
	 * without one they wait forever rather than failing. Anywhere else, show it
	 * and let someone run it, or set NPM_TOKEN and GH_TOKEN in the environment
	 * so the problem never comes up.
	 */
	remedy?: string[];
}

/**
 * What a release would do. Treat it as advice you can show someone: nothing
 * here is load bearing, because `Ship.run` checks all of it again before it
 * touches anything.
 */
export interface Plan {
	bump: Bump;
	current: string;
	next: string;
	/** True when `next` repeats `current` to finish a release that died partway. */
	resuming: boolean;
	/** Every package in the workspace, in lockstep at `next`. */
	packages: Package[];
	/** Empty means ready to ship. */
	problems: Problem[];
}

/** Something standing between you and a release. */
export interface Problem {
	/** A short slug naming the class of problem, such as "dirty" or "npm-auth". */
	kind: string;
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

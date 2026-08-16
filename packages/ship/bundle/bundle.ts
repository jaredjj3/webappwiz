/** Turning a package's source into the files that actually go out. */
export interface Bundle {
	/**
	 * Builds the package in `dir` into whatever its manifest publishes. Throws
	 * if it does not build, which is the whole point of running before anything
	 * reaches a registry.
	 */
	build(dir: string): Promise<void>;
	/** Removes what `build` left, whether or not it got that far. */
	clean(dir: string): Promise<void>;
}

export interface FixOptions {
	/** Report problems without writing fixes, as CI wants it. */
	check: boolean;
}

/** Puts the workspace back in order, or says what is wrong with it. */
export interface Fix {
	/** Pass `check: true` to report problems without writing fixes. */
	run(opts: FixOptions): Promise<void>;
}

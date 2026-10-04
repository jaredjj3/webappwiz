/** Whatever a test wants to differ from a plain rule document. */
export interface RuleDocOptions {
	/** The release it shipped in, in its frontmatter; none when not given. */
	version?: string;
}

/** A `RULE.md` for tests to install: prose, stamped when given a version. */
export const ruleDoc = (name: string, opts: RuleDocOptions = {}): string =>
	[
		...(opts.version === undefined
			? []
			: ["---", `version: ${opts.version}`, "---", ""]),
		`# ${name}`,
		"",
		`Prose about ${name}.`,
		"",
	].join("\n");

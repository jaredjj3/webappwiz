/** Where a project keeps its rules, relative to its root. */
export const RULES_ROOT = ".wiz/scry";

/** The file each rule's directory holds. */
export const RULE_FILE = "RULE.md";

/** The directory beside a rule's `RULE.md` holding its eval cases. */
export const EVALS_DIR = "evals";

/** An eval case's file name: `<name>.good.<ext>` or `<name>.bad.<ext>`. */
export const EVAL_FILE =
	/^(?<name>[^.][^/]*?)\.(?<kind>good|bad)(?<ext>\.[^/]+)?$/;

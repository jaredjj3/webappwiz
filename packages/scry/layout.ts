/** Where a project keeps its rules, relative to its root. */
export const RULES_ROOT = ".wiz/scry";

/** The document each rule's directory holds: what it expects, and why. */
export const RULE_FILE = "RULE.md";

/** The check each rule's directory holds: a class implementing `Rule`. */
export const CHECK_FILE = "rule.ts";

/** Where a rule keeps its labeled cases, in its directory. */
export const CASES_DIR = "evals";

/**
 * A labeled case's file name: what the file would be called, with `good` or
 * `bad` before its extension, as `cart.bad.ts` is a `cart.ts` that breaks the
 * rule and `cart.test.good.ts` a `cart.test.ts` that follows it.
 */
export const CASE_FILE =
	/^(?<name>[^.][^/]*?)\.(?<kind>good|bad)(?<ext>\.[^/]+)?$/;

import type { Rule } from "./rule";
import { TestsNotWeakened } from "./signoff/tests-not-weakened";
import { VisualWorkTested } from "./signoff/visual-work-tested";

/**
 * What an agent weighs before merging a change, rather than what it checks a
 * file against: whether the change needs a person to look at it.
 *
 * No command runs these. They are documents an agent reads and applies itself,
 * which is why they carry no glob and no check, and `wiz rules show` prints
 * them the same as any other.
 */
export const SIGNOFF_RULES: Rule[] = [
	new TestsNotWeakened(),
	new VisualWorkTested(),
];

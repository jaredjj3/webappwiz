import { type RuleRef, rule } from "@webappwiz/style";

// Absolute paths, so the refs resolve from any consumer's guide module.
const here = (name: string): RuleRef =>
	rule(`${import.meta.dir}/rules/${name}.md`);

export const classesOverFunctionExports = here("classes-over-function-exports");
export const testsReadLikeSentences = here("tests-read-like-sentences");
export const commentsSayWhyNotWhat = here("comments-say-why-not-what");
export const docCommentsAddressUsers = here("doc-comments-address-users");
export const noPonytailPrefixes = here("no-ponytail-prefixes");
export const oneDirPerInterface = here("one-dir-per-interface");

/** The default style guide for webappwiz projects. */
export const base: RuleRef[] = [
	classesOverFunctionExports,
	testsReadLikeSentences,
	commentsSayWhyNotWhat,
	docCommentsAddressUsers,
	noPonytailPrefixes,
	oneDirPerInterface,
];

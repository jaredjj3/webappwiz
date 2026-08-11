import { type RuleRef, rule } from "../guide";
import { classesOverFunctionExports as classesCheck } from "./classes-over-function-exports";
import { noEmDashes as emDashCheck } from "./no-em-dashes";
import { oneClassPerFile as oneClassCheck } from "./one-class-per-file";

// Absolute paths, so the refs resolve from any consumer's guide module.
const here = (name: string, opts = {}): RuleRef =>
	rule(`${import.meta.dir}/${name}.md`, opts);

export const noEmDashes = here("no-em-dashes", { check: emDashCheck });
export const oneClassPerFile = here("one-class-per-file", {
	check: oneClassCheck,
});
// The check sees function-typed parameters but not interface-typed ones, so
// it is partial and the agent still reads what it cannot.
export const classesOverFunctionExports = here(
	"classes-over-function-exports",
	{
		check: classesCheck,
		partial: true,
	},
);
export const testsReadLikeSentences = here("tests-read-like-sentences");
export const commentsSayWhyNotWhat = here("comments-say-why-not-what");
export const docCommentsAddressUsers = here("doc-comments-address-users");
export const noPonytailPrefixes = here("no-ponytail-prefixes");
export const oneDirPerInterface = here("one-dir-per-interface");

/** The rules every webappwiz repository runs, and what a missing
 * `lint.config.ts` means. */
export const recommended: RuleRef[] = [
	noEmDashes,
	oneClassPerFile,
	classesOverFunctionExports,
	testsReadLikeSentences,
	commentsSayWhyNotWhat,
	docCommentsAddressUsers,
	noPonytailPrefixes,
	oneDirPerInterface,
];

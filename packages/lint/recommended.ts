import { ClassesOverFunctionExports } from "./rule/classes-over-function-exports";
import { CommentsSayWhyNotWhat } from "./rule/comments-say-why-not-what";
import { DocCommentsAddressUsers } from "./rule/doc-comments-address-users";
import { NoEmDashes } from "./rule/no-em-dashes";
import { OneClassPerFile } from "./rule/one-class-per-file";
import { OneDirPerInterface } from "./rule/one-dir-per-interface";
import type { Rule } from "./rule/rule";
import { TestsReadLikeSentences } from "./rule/tests-read-like-sentences";

/** The rules every webappwiz repository runs, and what a missing
 * `lint.config.ts` means. */
export const recommended: Rule[] = [
	new NoEmDashes(),
	new OneClassPerFile(),
	new ClassesOverFunctionExports(),
	new TestsReadLikeSentences(),
	new CommentsSayWhyNotWhat(),
	new DocCommentsAddressUsers(),
	new OneDirPerInterface(),
];

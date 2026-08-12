import { ClassesOverFunctionExports } from "./rule/classes-over-function-exports";
import { CommentsSayWhyNotWhat } from "./rule/comments-say-why-not-what";
import { DocCommentsAddressUsers } from "./rule/doc-comments-address-users";
import { FakesOverMocks } from "./rule/fakes-over-mocks";
import { NoEmDashes } from "./rule/no-em-dashes";
import { ObjectsOverCallbacks } from "./rule/objects-over-callbacks";
import { OneClassPerFile } from "./rule/one-class-per-file";
import { OneDirPerInterface } from "./rule/one-dir-per-interface";
import type { Rule } from "./rule/rule";
import { SimpleTestSetup } from "./rule/simple-test-setup";
import { TestsReadLikeSentences } from "./rule/tests-read-like-sentences";

/** The rules every webappwiz repository runs, and what a missing
 * `lint.config.ts` means. */
export const recommended: Rule[] = [
	new NoEmDashes(),
	new OneClassPerFile(),
	new ClassesOverFunctionExports(),
	new ObjectsOverCallbacks(),
	new TestsReadLikeSentences(),
	new SimpleTestSetup(),
	new FakesOverMocks(),
	new CommentsSayWhyNotWhat(),
	new DocCommentsAddressUsers(),
	new OneDirPerInterface(),
];

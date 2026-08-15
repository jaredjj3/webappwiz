import { defineRules } from "./config";
import { ClassesOverFunctionExports } from "./judge/classes-over-function-exports";
import { CommentsSayWhyNotWhat } from "./judge/comments-say-why-not-what";
import { DevServersFindAPort } from "./judge/dev-servers-find-a-port";
import { DocCommentsAddressUsers } from "./judge/doc-comments-address-users";
import { FakesOverMocks } from "./judge/fakes-over-mocks";
import { NamedOptionsLast } from "./judge/named-options-last";
import { NoEmDashes } from "./judge/no-em-dashes";
import { ObjectsOverCallbacks } from "./judge/objects-over-callbacks";
import { OneClassPerFile } from "./judge/one-class-per-file";
import { OneDirPerInterface } from "./judge/one-dir-per-interface";
import { ParametersDeclareFields } from "./judge/parameters-declare-fields";
import { ReactiveOverUseState } from "./judge/reactive-over-use-state";
import { ResourcesAreDisposable } from "./judge/resources-are-disposable";
import { SimpleTestSetup } from "./judge/simple-test-setup";

/**
 * Every rule webappwiz judges itself by, named one by one. There is no preset
 * to spread and nothing runs implicitly: a rule is here or it does not run.
 *
 * A constant rather than a config file, because rules reach the harness as
 * objects. A project with its own rules writes its own list and hands it to
 * `JudgeCommands` or to `Check` directly, rather than pointing a flag at a
 * module for one of these to import.
 */
export const WEBAPPWIZ_RULES = defineRules({
	rules: [
		new NoEmDashes(),
		new OneClassPerFile(),
		new ParametersDeclareFields(),
		new ClassesOverFunctionExports(),
		new ObjectsOverCallbacks(),
		new NamedOptionsLast(),
		new SimpleTestSetup(),
		new FakesOverMocks(),
		new CommentsSayWhyNotWhat(),
		new DocCommentsAddressUsers(),
		new OneDirPerInterface(),
		new DevServersFindAPort(),
		new ReactiveOverUseState(),
		new ResourcesAreDisposable(),
	],
});

import { defineRules } from "@webappwiz/rules";
import {
	ClassesOverFunctionExports,
	CommentsSayWhyNotWhat,
	DevServersFindAPort,
	DocCommentsAddressUsers,
	ExportLeadsTheFile,
	FakesOverMocks,
	MatchersOverTestLogic,
	NamedOptionsLast,
	NoEmDashes,
	ObjectsOverCallbacks,
	OneClassPerFile,
	OneDirPerInterface,
	ParametersDeclareFields,
	ReactiveOverUseState,
	ResourcesAreDisposable,
	SimpleTestSetup,
	TestsOwnTheirState,
} from "@webappwiz/rules/catalog";

/**
 * Every rule webappwiz judges itself by, named one by one. There is no preset
 * to spread and nothing runs implicitly: a rule is here or it does not run.
 *
 * A constant rather than a config file, because rules reach the harness as
 * objects. A project with its own rules writes its own list and hands it to
 * `JudgeCommands` or to `Check` directly, rather than pointing a flag at a
 * module for one of these to import.
 */
export const JUDGE_RULES = defineRules({
	rules: [
		new NoEmDashes(),
		new OneClassPerFile(),
		new ExportLeadsTheFile(),
		new ParametersDeclareFields(),
		new ClassesOverFunctionExports(),
		new ObjectsOverCallbacks(),
		new NamedOptionsLast(),
		new SimpleTestSetup(),
		new TestsOwnTheirState(),
		new FakesOverMocks(),
		new MatchersOverTestLogic(),
		new CommentsSayWhyNotWhat(),
		new DocCommentsAddressUsers(),
		new OneDirPerInterface(),
		new DevServersFindAPort(),
		new ReactiveOverUseState(),
		new ResourcesAreDisposable(),
	],
});

import {
	ClassesOverFunctionExports,
	CommentsSayWhyNotWhat,
	DevServersFindAPort,
	DocCommentsAddressUsers,
	defineJudge,
	FakesOverMocks,
	NamedOptionsLast,
	NoEmDashes,
	ObjectsOverCallbacks,
	OneClassPerFile,
	OneDirPerInterface,
	ParametersDeclareFields,
	ReactiveOverUseState,
	SimpleTestSetup,
	TestsReadLikeSentences,
} from "@webappwiz/judge";

/**
 * Every rule webappwiz judges itself by, named one by one. There is no preset
 * to spread and nothing runs implicitly: a rule is here or it does not run.
 *
 * A constant rather than a config file, because rules reach judge as objects.
 * A project with its own rules writes its own list and hands it to
 * `JudgeCommands` or to `Check` directly, rather than pointing a flag at a
 * module for one of these to import.
 */
export const WEBAPPWIZ_RULES = defineJudge({
	rules: [
		new NoEmDashes(),
		new OneClassPerFile(),
		new ParametersDeclareFields(),
		new ClassesOverFunctionExports(),
		new ObjectsOverCallbacks(),
		new NamedOptionsLast(),
		new TestsReadLikeSentences(),
		new SimpleTestSetup(),
		new FakesOverMocks(),
		new CommentsSayWhyNotWhat(),
		new DocCommentsAddressUsers(),
		new OneDirPerInterface(),
		new DevServersFindAPort(),
		new ReactiveOverUseState(),
	],
});

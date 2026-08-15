import { defineRules, type Rule } from "@webappwiz/rules";
import {
	ClassesOverFunctionExports,
	CommentsSayWhyNotWhat,
	DevServersFindAPort,
	DocCommentsAddressUsers,
	FakesOverMocks,
	NamedOptionsLast,
	NoEmDashes,
	ObjectsOverCallbacks,
	OneClassPerFile,
	OneDirPerInterface,
	ParametersDeclareFields,
	ReactiveOverUseState,
	ResourcesAreDisposable,
	SimpleTestSetup,
	TestsNotWeakened,
	VisualWorkTested,
} from "@webappwiz/rules/rules";

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

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

// One section per command that runs rules, so a repo has one place to look.
export default {
	// Every rule this repository judges by, named one by one. There is no preset
	// to spread and nothing runs implicitly: a rule is here or it does not run.
	judge: defineJudge({
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
	}),
};

import {
	ClassesOverFunctionExports,
	CommentsSayWhyNotWhat,
	DevServersFindAPort,
	DocCommentsAddressUsers,
	defineConfig,
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

// Every rule this repository runs, named one by one. There is no preset to
// spread and nothing runs implicitly: a rule is here or it does not run.
export default defineConfig({
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

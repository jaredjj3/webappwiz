// judge-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export {
	type AnalyzeOptions,
	Analyzer,
	type AnalyzerEvents,
	DEFAULT_CHUNK,
	type Finished,
	type Task,
	type Violation,
} from "./analyze";
export { Check } from "./check";
export { Checker, type FileText } from "./checker";
export { type Config, type ConfigInput, defineJudge } from "./config";
export { diagnose } from "./diagnose";
export type { ConfigDiagnostic, Diagnostic, Level } from "./diagnostic";
export { Hit } from "./hit";
export { exemptions } from "./ignore";
export { Mechanizer } from "./mechanize";
export { ClassesOverFunctionExports } from "./rule/classes-over-function-exports";
export { CommentsSayWhyNotWhat } from "./rule/comments-say-why-not-what";
export { DevServersFindAPort } from "./rule/dev-servers-find-a-port";
export { DocCommentsAddressUsers } from "./rule/doc-comments-address-users";
export { FakesOverMocks } from "./rule/fakes-over-mocks";
export { NamedOptionsLast } from "./rule/named-options-last";
export { NoEmDashes } from "./rule/no-em-dashes";
export { ObjectsOverCallbacks } from "./rule/objects-over-callbacks";
export { OneClassPerFile } from "./rule/one-class-per-file";
export { OneDirPerInterface } from "./rule/one-dir-per-interface";
export { ParametersDeclareFields } from "./rule/parameters-declare-fields";
export { ReactiveOverUseState } from "./rule/reactive-over-use-state";
export {
	type Checked,
	hasCheck,
	type Judged,
	needsAgent,
	type PartlyChecked,
	type Rule,
} from "./rule/rule";
export { SimpleTestSetup } from "./rule/simple-test-setup";
export { TestsReadLikeSentences } from "./rule/tests-read-like-sentences";
export { RuleDocument } from "./rule-document";
export { SyntaxKind, type Token, tokens } from "./scan";

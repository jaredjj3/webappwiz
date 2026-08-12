// lint-ignore-file one-dir-per-interface: this is the package entry point named in
// package.json exports, not a barrel sitting inside an interface's directory
export {
	AGENTS,
	type Agent,
	Analyzer,
	type AnalyzerEvents,
	agentCommand,
	type Finished,
	type Task,
	type Violation,
} from "./analyze";
export type {
	Diagnostic,
	GuideDiagnostic,
	Level,
} from "./diagnostic";
export { Finding } from "./finding";
export { DEFAULT_GUIDE, defineGuide, type Guide, isGuide } from "./guide";
export { FakeGuideLoader } from "./guide-loader/fake-guide-loader";
export type { GuideLoader } from "./guide-loader/guide-loader";
export { ModuleGuideLoader } from "./guide-loader/module-guide-loader";
export { Guides } from "./guides";
export { exemptions } from "./ignore";
export { Lint } from "./lint";
export { type FileText, Linter } from "./linter";
export { Mechanizer } from "./mechanize";
export { recommended } from "./recommended";
export { ClassesOverFunctionExports } from "./rule/classes-over-function-exports";
export { CommentsSayWhyNotWhat } from "./rule/comments-say-why-not-what";
export { DocCommentsAddressUsers } from "./rule/doc-comments-address-users";
export { NamedOptionsLast } from "./rule/named-options-last";
export { NoEmDashes } from "./rule/no-em-dashes";
export { ObjectsOverCallbacks } from "./rule/objects-over-callbacks";
export { OneClassPerFile } from "./rule/one-class-per-file";
export { OneDirPerInterface } from "./rule/one-dir-per-interface";
export { ParametersDeclareFields } from "./rule/parameters-declare-fields";
export type { Rule } from "./rule/rule";
export { TestsReadLikeSentences } from "./rule/tests-read-like-sentences";
export { RuleDocument } from "./rule-document";
export { SyntaxKind, type Token, tokens } from "./scan";

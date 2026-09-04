import classesOverFunctionExports from "./classes-over-function-exports/RULE.md" with {
	type: "text",
};
import commentsSayWhyNotWhat from "./comments-say-why-not-what/RULE.md" with {
	type: "text",
};
import devServersFindAPort from "./dev-servers-find-a-port/RULE.md" with {
	type: "text",
};
import docCommentsAddressUsers from "./doc-comments-address-users/RULE.md" with {
	type: "text",
};
import exportLeadsTheFile from "./export-leads-the-file/RULE.md" with {
	type: "text",
};
import fakesOverMocks from "./fakes-over-mocks/RULE.md" with { type: "text" };
import matchersOverTestLogic from "./matchers-over-test-logic/RULE.md" with {
	type: "text",
};
import namedOptionsLast from "./named-options-last/RULE.md" with {
	type: "text",
};
import noEmDashes from "./no-em-dashes/RULE.md" with { type: "text" };
import objectsOverCallbacks from "./objects-over-callbacks/RULE.md" with {
	type: "text",
};
import oneClassPerFile from "./one-class-per-file/RULE.md" with {
	type: "text",
};
import parametersDeclareFields from "./parameters-declare-fields/RULE.md" with {
	type: "text",
};
import reactiveOverUseState from "./reactive-over-use-state/RULE.md" with {
	type: "text",
};
import resourcesAreDisposable from "./resources-are-disposable/RULE.md" with {
	type: "text",
};
import simpleTestSetup from "./simple-test-setup/RULE.md" with { type: "text" };
import testsOwnTheirState from "./tests-own-their-state/RULE.md" with {
	type: "text",
};

/**
 * Every rule this package ships, id to `RULE.md`, the way `@webappwiz/cli`
 * bundles skills. Imported rather than read off a directory so the documents
 * travel inside the build, and so a rule is here or it does not ship.
 */
export const catalog: Record<string, string> = {
	"classes-over-function-exports": classesOverFunctionExports,
	"comments-say-why-not-what": commentsSayWhyNotWhat,
	"dev-servers-find-a-port": devServersFindAPort,
	"doc-comments-address-users": docCommentsAddressUsers,
	"export-leads-the-file": exportLeadsTheFile,
	"fakes-over-mocks": fakesOverMocks,
	"matchers-over-test-logic": matchersOverTestLogic,
	"named-options-last": namedOptionsLast,
	"no-em-dashes": noEmDashes,
	"objects-over-callbacks": objectsOverCallbacks,
	"one-class-per-file": oneClassPerFile,
	"parameters-declare-fields": parametersDeclareFields,
	"reactive-over-use-state": reactiveOverUseState,
	"resources-are-disposable": resourcesAreDisposable,
	"simple-test-setup": simpleTestSetup,
	"tests-own-their-state": testsOwnTheirState,
};

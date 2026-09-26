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
import exampleScript from "./example-script/RULE.md" with { type: "text" };
import exampleScriptCheck from "./example-script/scripts/check.sh" with {
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
import testSetupNamesWhatItMakes from "./test-setup-names-what-it-makes/RULE.md" with {
	type: "text",
};
import testsOwnTheirState from "./tests-own-their-state/RULE.md" with {
	type: "text",
};

/**
 * Every rule this package ships, id to the files in its directory by path:
 * its `RULE.md`, and any scripts beside it. Imported rather than read off a
 * directory so the files travel inside the build, and so a rule is here or it
 * does not ship.
 */
export const catalog: Record<string, Record<string, string>> = {
	"classes-over-function-exports": { "RULE.md": classesOverFunctionExports },
	"comments-say-why-not-what": { "RULE.md": commentsSayWhyNotWhat },
	"dev-servers-find-a-port": { "RULE.md": devServersFindAPort },
	"doc-comments-address-users": { "RULE.md": docCommentsAddressUsers },
	"example-script": {
		"RULE.md": exampleScript,
		"scripts/check.sh": exampleScriptCheck,
	},
	"export-leads-the-file": { "RULE.md": exportLeadsTheFile },
	"fakes-over-mocks": { "RULE.md": fakesOverMocks },
	"matchers-over-test-logic": { "RULE.md": matchersOverTestLogic },
	"named-options-last": { "RULE.md": namedOptionsLast },
	"no-em-dashes": { "RULE.md": noEmDashes },
	"objects-over-callbacks": { "RULE.md": objectsOverCallbacks },
	"one-class-per-file": { "RULE.md": oneClassPerFile },
	"parameters-declare-fields": { "RULE.md": parametersDeclareFields },
	"reactive-over-use-state": { "RULE.md": reactiveOverUseState },
	"resources-are-disposable": { "RULE.md": resourcesAreDisposable },
	"simple-test-setup": { "RULE.md": simpleTestSetup },
	"test-setup-names-what-it-makes": { "RULE.md": testSetupNamesWhatItMakes },
	"tests-own-their-state": { "RULE.md": testsOwnTheirState },
};

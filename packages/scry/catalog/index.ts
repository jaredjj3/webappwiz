import { readFileSync } from "node:fs";
import type { RuleClass } from "../rule";
import classesOverFunctionExports from "./classes-over-function-exports/RULE.md" with {
	type: "text",
};
import ClassesOverFunctionExports from "./classes-over-function-exports/rule";
import commentsSayWhyNotWhat from "./comments-say-why-not-what/RULE.md" with {
	type: "text",
};
import CommentsSayWhyNotWhat from "./comments-say-why-not-what/rule";
import docCommentsAddressUsers from "./doc-comments-address-users/RULE.md" with {
	type: "text",
};
import DocCommentsAddressUsers from "./doc-comments-address-users/rule";
import exportLeadsTheFile from "./export-leads-the-file/RULE.md" with {
	type: "text",
};
import ExportLeadsTheFile from "./export-leads-the-file/rule";
import fakesOverMocks from "./fakes-over-mocks/RULE.md" with { type: "text" };
import FakesOverMocks from "./fakes-over-mocks/rule";
import logicLivesInControllers from "./logic-lives-in-controllers/RULE.md" with {
	type: "text",
};
import LogicLivesInControllers from "./logic-lives-in-controllers/rule";
import matchersOverTestLogic from "./matchers-over-test-logic/RULE.md" with {
	type: "text",
};
import MatchersOverTestLogic from "./matchers-over-test-logic/rule";
import namedOptionsLast from "./named-options-last/RULE.md" with {
	type: "text",
};
import NamedOptionsLast from "./named-options-last/rule";
import noEmDashes from "./no-em-dashes/RULE.md" with { type: "text" };
import NoEmDashes from "./no-em-dashes/rule";
import objectsOverCallbacks from "./objects-over-callbacks/RULE.md" with {
	type: "text",
};
import ObjectsOverCallbacks from "./objects-over-callbacks/rule";
import oneClassPerFile from "./one-class-per-file/RULE.md" with {
	type: "text",
};
import OneClassPerFile from "./one-class-per-file/rule";
import parametersDeclareFields from "./parameters-declare-fields/RULE.md" with {
	type: "text",
};
import ParametersDeclareFields from "./parameters-declare-fields/rule";
import reactiveOverUseState from "./reactive-over-use-state/RULE.md" with {
	type: "text",
};
import ReactiveOverUseState from "./reactive-over-use-state/rule";
import resourcesAreDisposable from "./resources-are-disposable/RULE.md" with {
	type: "text",
};
import ResourcesAreDisposable from "./resources-are-disposable/rule";
import simpleTestSetup from "./simple-test-setup/RULE.md" with { type: "text" };
import SimpleTestSetup from "./simple-test-setup/rule";
import testSetupNamesWhatItMakes from "./test-setup-names-what-it-makes/RULE.md" with {
	type: "text",
};
import TestSetupNamesWhatItMakes from "./test-setup-names-what-it-makes/rule";
import testsOwnTheirState from "./tests-own-their-state/RULE.md" with {
	type: "text",
};
import TestsOwnTheirState from "./tests-own-their-state/rule";

/**
 * The code each rule ships beside its `RULE.md`: its check and the tests that
 * run it on its cases, as text to copy into a project. Read off disk like the
 * cases below.
 */
const CODE: Record<string, string[]> = {
	"classes-over-function-exports": ["rule.test.ts", "rule.ts"],
	"comments-say-why-not-what": ["rule.test.ts", "rule.ts"],
	"doc-comments-address-users": ["rule.test.ts", "rule.ts"],
	"export-leads-the-file": ["rule.test.ts", "rule.ts"],
	"fakes-over-mocks": ["rule.test.ts", "rule.ts"],
	"logic-lives-in-controllers": ["rule.test.ts", "rule.ts"],
	"matchers-over-test-logic": ["rule.test.ts", "rule.ts"],
	"named-options-last": ["rule.test.ts", "rule.ts"],
	"no-em-dashes": ["rule.test.ts", "rule.ts"],
	"objects-over-callbacks": ["rule.test.ts", "rule.ts"],
	"one-class-per-file": ["rule.test.ts", "rule.ts"],
	"parameters-declare-fields": ["rule.test.ts", "rule.ts"],
	"reactive-over-use-state": ["rule.test.ts", "rule.ts"],
	"resources-are-disposable": ["rule.test.ts", "rule.ts"],
	"simple-test-setup": ["rule.test.ts", "rule.ts"],
	"test-setup-names-what-it-makes": ["rule.test.ts", "rule.ts"],
	"tests-own-their-state": ["rule.test.ts", "rule.ts"],
};

/**
 * Each rule's eval cases, by name in its `evals/`. Listed like the imports
 * above, but read off disk rather than imported: tsc type checks a `.ts`
 * file even imported as text, and an eval case is a fragment that breaks a
 * rule on purpose. The package ships its source, so they sit beside this file.
 */
const EVALS: Record<string, string[]> = {
	"classes-over-function-exports": [
		"deploy.good.ts",
		"feature-flags.bad.ts",
		"fix-options.good.ts",
		"fix.bad.ts",
		"invoice-mailer.good.ts",
		"prune.bad.ts",
		"reader.bad.ts",
		"report.good.ts",
		"slugify.good.ts",
		"stamp-with-now.good.ts",
		"stamp.bad.ts",
		"stamper.good.ts",
		"trimmed.good.ts",
		"user-repository.bad.ts",
	],
	"comments-say-why-not-what": [
		"avatar-url.bad.ts",
		"counter.bad.ts",
		"csv-export.good.ts",
		"order-summary.bad.ts",
		"rate-limiter.good.ts",
		"registry-retry.good.ts",
		"session-store.good.ts",
		"skip-dotfiles.good.ts",
		"user-names.bad.ts",
		"webhook-handler.bad.ts",
	],
	"doc-comments-address-users": [
		"currency-code.bad.ts",
		"image-resizer.bad.ts",
		"parse-flag.bad.ts",
		"parse-flag.good.ts",
		"rate-limiter.good.ts",
		"retry-backoff.good.ts",
		"session-store.bad.ts",
		"slugify.good.ts",
		"todo-store.good.ts",
	],
	"export-leads-the-file": [
		"files.good.tsx",
		"index.good.ts",
		"job-scheduler.bad.ts",
		"markdown-table.bad.ts",
		"padded-stamper.bad.ts",
		"reporter.good.ts",
		"retry-policy.good.ts",
		"stamper-arrow-helper.bad.ts",
		"stamper-pad-method.good.ts",
		"stamper.bad.ts",
		"stamper.good.ts",
		"task-board.good.tsx",
		"token-bucket.good.ts",
		"webhook-signer.bad.ts",
	],
	"fakes-over-mocks": [
		"checkout.test.bad.ts",
		"checkout.test.good.ts",
		"date-range.test.good.ts",
		"invoice-mailer.test.good.ts",
		"mock-data-generator.test.good.ts",
		"report-exporter.test.bad.ts",
		"theme-preference.test.bad.ts",
		"user-signup.test.bad.ts",
	],
	"logic-lives-in-controllers": [
		"account-menu.good.tsx",
		"bookmark-server.bad.ts",
		"bookmark-server.good.ts",
		"invoice-routes.good.ts",
		"invoice-service.bad.ts",
		"playlist.bad.tsx",
		"playlist.good.tsx",
		"prune.bad.ts",
		"prune.good.ts",
		"todo-editor.bad.tsx",
		"todo-editor.good.tsx",
		"todo-routes.bad.ts",
		"todo-routes.good.ts",
	],
	"matchers-over-test-logic": [
		"cart-add.test.bad.ts",
		"cart-items.test.good.ts",
		"cart-prices.test.bad.ts",
		"cart-total.test.bad.ts",
		"http-status.test.bad.ts",
		"invoice-parser.test.good.ts",
		"leaderboard.test.bad.ts",
		"path-normalize.test.bad.ts",
		"priced-matcher.test.good.ts",
		"session-timeout.test.good.ts",
		"slug-matchers.test.good.ts",
	],
	"named-options-last": [
		"currency-format.bad.ts",
		"fetcher.good.ts",
		"geometry.good.ts",
		"image-resize.good.ts",
		"job-queue.good.ts",
		"paginate.bad.ts",
		"read-fs-after-opts.bad.ts",
		"reader.good.ts",
		"send-email.bad.ts",
		"write-inline-opts.bad.ts",
		"write-opts-first.bad.ts",
		"write-positional.bad.ts",
		"write.good.ts",
	],
	"no-em-dashes": [
		"business-hours.good.ts",
		"cli-flags.good.ts",
		"deploy-guide.bad.md",
		"parse-flag.bad.ts",
		"parse-flag.good.ts",
		"release-notes.good.md",
		"report-log.bad.ts",
		"retry-window.good.ts",
		"stderr-log.bad.ts",
		"stderr-log.good.ts",
		"upload-errors.bad.ts",
		"webhook-verifier.bad.ts",
	],
	"objects-over-callbacks": [
		"alert-service.bad.ts",
		"file-uploader.bad.ts",
		"fixture-server.good.ts",
		"group-by.good.ts",
		"largest-word.good.ts",
		"price-label.good.ts",
		"profile-cache.bad.ts",
		"regex-detector.good.ts",
		"saver.bad.ts",
		"saver.good.ts",
		"scanner.bad.ts",
		"search-box.good.ts",
		"stamper.bad.ts",
		"stamper.good.ts",
		"tag-filter.good.tsx",
	],
	"one-class-per-file": [
		"date-ranges.good.ts",
		"lru-cache.bad.ts",
		"payment-client.bad.ts",
		"rate-limiter.good.ts",
		"registry.good.ts",
		"shipping-rates.bad.ts",
		"stamper.bad.ts",
		"stamper.good.ts",
		"timestamped-entity.good.ts",
	],
	"parameters-declare-fields": [
		"api-client.good.ts",
		"audit-trail.bad.ts",
		"event-counter.good.ts",
		"order-service.good.ts",
		"product.bad.ts",
		"redis-lock.bad.ts",
		"retry.good.ts",
		"saver.bad.ts",
		"stamper.bad.ts",
		"stamper.good.ts",
		"uptime.good.ts",
	],
	"reactive-over-use-state": [
		"comment-composer.good.tsx",
		"countdown-timer.bad.tsx",
		"currency-format.good.ts",
		"disclosure.good.tsx",
		"order-history.bad.tsx",
		"search-box.bad.tsx",
		"search.good.tsx",
		"signup-wizard.bad.tsx",
		"upload-queue.good.tsx",
	],
	"resources-are-disposable": [
		"fake-uploads.good.ts",
		"job-scheduler.bad.ts",
		"log-tailer.bad.ts",
		"poller-unlisteners.bad.ts",
		"poller.bad.ts",
		"poller.good.ts",
		"presence-tracker.good.ts",
		"server.good.ts",
		"session-heartbeat.bad.ts",
		"shipping-rates.good.ts",
		"timer.bad.ts",
		"timer.good.ts",
		"watcher.bad.ts",
		"window-resize.good.ts",
	],
	"simple-test-setup": [
		"cart-total.test.bad.ts",
		"cart.test.good.ts",
		"duration.test.good.ts",
		"feature-flags.test.bad.ts",
		"inline-world.test.bad.ts",
		"invoice-parser.test.good.ts",
		"looped-tests.test.bad.ts",
		"nested-describe.test.bad.ts",
		"password-strength.test.bad.ts",
		"rate-limiter.test.good.ts",
		"slugify.test.good.ts",
		"toggle-button.test.bad.tsx",
		"toggle-button.test.good.tsx",
		"token-store.test.bad.ts",
		"upload-queue.test.bad.ts",
		"upload-queue.test.good.ts",
	],
	"test-setup-names-what-it-makes": [
		"cart-builder.test.bad.ts",
		"cart-testing.test.bad.ts",
		"checkout-harness.test.bad.ts",
		"checkout-testing.test.good.ts",
		"checkout.test.good.ts",
		"csv-import.test.good.ts",
		"git-repo.test.good.ts",
		"harness-comment.test.bad.ts",
		"lands-branch.test.good.ts",
		"mailbox.test.good.ts",
		"make-test-harness.test.bad.ts",
		"search-index.test.bad.ts",
		"testing.bad.ts",
		"testing.good.ts",
		"webhook-delivery.test.bad.ts",
	],
	"tests-own-their-state": [
		"cart-refund.test.good.ts",
		"cart-registry.test.bad.ts",
		"cart-session.test.bad.ts",
		"chat-room.test.bad.ts",
		"checkout-harness.test.bad.ts",
		"checkout.test.good.ts",
		"inventory.test.good.ts",
		"report-export.test.bad.ts",
		"route-matcher.test.good.ts",
		"stocked-cart.test.good.ts",
		"subscription-renewal.test.good.ts",
		"testing.bad.ts",
	],
};

/** A rule the catalog ships: the class that checks, and its directory's files. */
export interface ShippedRule {
	/** What its `rule.ts` default-exports, settings and all. */
	rule: RuleClass;
	/** Its directory's files by path: `RULE.md`, `rule.ts`, tests and cases. */
	files: Record<string, string>;
}

/**
 * Every rule this package ships, id to its class and the files in its
 * directory: its `RULE.md`, its `rule.ts` and tests, and its eval cases.
 * Imported rather than read off a directory so the files travel inside the
 * build, and so a rule is here or it does not ship.
 */
export const catalog: Record<string, ShippedRule> = withFiles({
	"classes-over-function-exports": {
		rule: ClassesOverFunctionExports,
		files: { "RULE.md": classesOverFunctionExports },
	},
	"comments-say-why-not-what": {
		rule: CommentsSayWhyNotWhat,
		files: { "RULE.md": commentsSayWhyNotWhat },
	},
	"doc-comments-address-users": {
		rule: DocCommentsAddressUsers,
		files: { "RULE.md": docCommentsAddressUsers },
	},
	"export-leads-the-file": {
		rule: ExportLeadsTheFile,
		files: { "RULE.md": exportLeadsTheFile },
	},
	"fakes-over-mocks": {
		rule: FakesOverMocks,
		files: { "RULE.md": fakesOverMocks },
	},
	"logic-lives-in-controllers": {
		rule: LogicLivesInControllers,
		files: { "RULE.md": logicLivesInControllers },
	},
	"matchers-over-test-logic": {
		rule: MatchersOverTestLogic,
		files: { "RULE.md": matchersOverTestLogic },
	},
	"named-options-last": {
		rule: NamedOptionsLast,
		files: { "RULE.md": namedOptionsLast },
	},
	"no-em-dashes": {
		rule: NoEmDashes,
		files: { "RULE.md": noEmDashes },
	},
	"objects-over-callbacks": {
		rule: ObjectsOverCallbacks,
		files: { "RULE.md": objectsOverCallbacks },
	},
	"one-class-per-file": {
		rule: OneClassPerFile,
		files: { "RULE.md": oneClassPerFile },
	},
	"parameters-declare-fields": {
		rule: ParametersDeclareFields,
		files: { "RULE.md": parametersDeclareFields },
	},
	"reactive-over-use-state": {
		rule: ReactiveOverUseState,
		files: { "RULE.md": reactiveOverUseState },
	},
	"resources-are-disposable": {
		rule: ResourcesAreDisposable,
		files: { "RULE.md": resourcesAreDisposable },
	},
	"simple-test-setup": {
		rule: SimpleTestSetup,
		files: { "RULE.md": simpleTestSetup },
	},
	"test-setup-names-what-it-makes": {
		rule: TestSetupNamesWhatItMakes,
		files: { "RULE.md": testSetupNamesWhatItMakes },
	},
	"tests-own-their-state": {
		rule: TestsOwnTheirState,
		files: { "RULE.md": testsOwnTheirState },
	},
});

function withFiles(
	rules: Record<string, ShippedRule>,
): Record<string, ShippedRule> {
	const rosters = [
		...Object.entries(CODE),
		...Object.entries(EVALS).map(([id, names]): [string, string[]] => [
			id,
			names.map((name) => `evals/${name}`),
		]),
	];
	for (const [id, paths] of rosters) {
		const files = rules[id]?.files;
		if (files === undefined) {
			throw new Error(`files for ${id}, which is not in the catalog`);
		}
		for (const path of paths) {
			files[path] = readFileSync(
				new URL(`./${id}/${path}`, import.meta.url),
				"utf8",
			);
		}
	}
	return rules;
}

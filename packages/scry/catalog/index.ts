import { readFileSync } from "node:fs";
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
import testSetupNamesWhatItMakes from "./test-setup-names-what-it-makes/RULE.md" with {
	type: "text",
};
import testsOwnTheirState from "./tests-own-their-state/RULE.md" with {
	type: "text",
};

/**
 * The code each rule ships beside its `RULE.md`: its check and the tests that
 * run it on its cases. Read off disk like the cases below.
 */
const CODE: Record<string, string[]> = {
	"export-leads-the-file": ["rule.test.ts", "rule.ts"],
	"fakes-over-mocks": ["rule.test.ts", "rule.ts"],
	"matchers-over-test-logic": ["rule.test.ts", "rule.ts"],
	"no-em-dashes": ["rule.test.ts", "rule.ts"],
	"one-class-per-file": ["rule.test.ts", "rule.ts"],
	"parameters-declare-fields": ["rule.test.ts", "rule.ts"],
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
		"invoice-mailer.good.ts",
		"prune.bad.ts",
		"slugify.good.ts",
		"user-repository.bad.ts",
	],
	"comments-say-why-not-what": [
		"avatar-url.bad.ts",
		"csv-export.good.ts",
		"order-summary.bad.ts",
		"rate-limiter.good.ts",
		"session-store.good.ts",
		"webhook-handler.bad.ts",
	],
	"dev-servers-find-a-port": [
		"admin-dashboard.test.bad.ts",
		"docs-server.good.ts",
		"mock-api-server.bad.ts",
		"preview-server.test.good.ts",
		"price-formatter.good.ts",
		"storybook-server.bad.ts",
	],
	"doc-comments-address-users": [
		"currency-code.bad.ts",
		"image-resizer.bad.ts",
		"rate-limiter.good.ts",
		"retry-backoff.good.ts",
		"session-store.bad.ts",
		"slugify.good.ts",
	],
	"export-leads-the-file": [
		"index.good.ts",
		"job-scheduler.bad.ts",
		"markdown-table.bad.ts",
		"retry-policy.good.ts",
		"token-bucket.good.ts",
		"webhook-signer.bad.ts",
	],
	"fakes-over-mocks": [
		"date-range.test.good.ts",
		"invoice-mailer.test.good.ts",
		"mock-data-generator.test.good.ts",
		"report-exporter.test.bad.ts",
		"theme-preference.test.bad.ts",
		"user-signup.test.bad.ts",
	],
	"matchers-over-test-logic": [
		"http-status.test.bad.ts",
		"invoice-parser.test.good.ts",
		"leaderboard.test.bad.ts",
		"path-normalize.test.bad.ts",
		"session-timeout.test.good.ts",
		"slug-matchers.test.good.ts",
	],
	"named-options-last": [
		"currency-format.bad.ts",
		"geometry.good.ts",
		"image-resize.good.ts",
		"job-queue.good.ts",
		"paginate.bad.ts",
		"send-email.bad.ts",
	],
	"no-em-dashes": [
		"business-hours.good.ts",
		"cli-flags.good.ts",
		"deploy-guide.bad.md",
		"release-notes.good.md",
		"upload-errors.bad.ts",
		"webhook-verifier.bad.ts",
	],
	"objects-over-callbacks": [
		"alert-service.bad.ts",
		"file-uploader.bad.ts",
		"group-by.good.ts",
		"price-label.good.ts",
		"profile-cache.bad.ts",
		"search-box.good.ts",
	],
	"one-class-per-file": [
		"date-ranges.good.ts",
		"lru-cache.bad.ts",
		"payment-client.bad.ts",
		"rate-limiter.good.ts",
		"shipping-rates.bad.ts",
		"timestamped-entity.good.ts",
	],
	"parameters-declare-fields": [
		"api-client.good.ts",
		"audit-trail.bad.ts",
		"event-counter.good.ts",
		"order-service.good.ts",
		"product.bad.ts",
		"redis-lock.bad.ts",
	],
	"reactive-over-use-state": [
		"comment-composer.good.tsx",
		"countdown-timer.bad.tsx",
		"currency-format.good.ts",
		"order-history.bad.tsx",
		"signup-wizard.bad.tsx",
		"upload-queue.good.tsx",
	],
	"resources-are-disposable": [
		"job-scheduler.bad.ts",
		"log-tailer.bad.ts",
		"presence-tracker.good.ts",
		"session-heartbeat.bad.ts",
		"shipping-rates.good.ts",
		"window-resize.good.ts",
	],
	"simple-test-setup": [
		"feature-flags.test.bad.ts",
		"invoice-parser.test.good.ts",
		"password-strength.test.bad.ts",
		"rate-limiter.test.good.ts",
		"slugify.test.good.ts",
		"token-store.test.bad.ts",
	],
	"test-setup-names-what-it-makes": [
		"csv-import.test.good.ts",
		"mailbox.test.good.ts",
		"search-index.test.bad.ts",
		"testing.bad.ts",
		"testing.good.ts",
		"webhook-delivery.test.bad.ts",
	],
	"tests-own-their-state": [
		"chat-room.test.bad.ts",
		"inventory.test.good.ts",
		"report-export.test.bad.ts",
		"route-matcher.test.good.ts",
		"subscription-renewal.test.good.ts",
		"testing.bad.ts",
	],
};

/**
 * Every rule this package ships, id to the files in its directory by path:
 * its `RULE.md`, its `rule.ts` and tests once it has them, and its eval cases. Imported rather
 * than read off a directory so the files travel inside the build, and so a
 * rule is here or it does not ship.
 */
export const catalog: Record<string, Record<string, string>> = withFiles({
	"classes-over-function-exports": { "RULE.md": classesOverFunctionExports },
	"comments-say-why-not-what": { "RULE.md": commentsSayWhyNotWhat },
	"dev-servers-find-a-port": { "RULE.md": devServersFindAPort },
	"doc-comments-address-users": { "RULE.md": docCommentsAddressUsers },
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
});

function withFiles(
	rules: Record<string, Record<string, string>>,
): Record<string, Record<string, string>> {
	const rosters = [
		...Object.entries(CODE),
		...Object.entries(EVALS).map(([id, names]): [string, string[]] => [
			id,
			names.map((name) => `evals/${name}`),
		]),
	];
	for (const [id, paths] of rosters) {
		const files = rules[id];
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

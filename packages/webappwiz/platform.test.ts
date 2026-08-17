import { describe, expect, it } from "bun:test";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import manifest from "./package.json" with { type: "json" };

/**
 * The entry points that only answer somewhere particular, and where that is.
 * Named one by one rather than inferred from a directory, because the split is
 * per entry point and not per module: `webappwiz/task` runs anywhere and
 * `webappwiz/task/browser` needs a DOM, out of the same directory.
 */
const PLATFORM: Record<string, "browser" | "node"> = {
	"./browser": "browser",
	"./task/browser": "browser",
	"./worker/web": "browser",
	"./cmd": "node",
	"./http/bun": "node",
	"./ship": "node",
	"./ship/testing": "node",
	"./system": "node",
	"./system/testing": "node",
};

/** A specifier this package imports from itself, which names an entry point. */
const SELF = /from\s*"(webappwiz\/[^"]+)"/g;

/** A relative specifier, which stays inside the module it is written in. */
const RELATIVE = /from\s*"(\.[^"]*)"/g;

const specifiers = (source: string, pattern: RegExp): string[] =>
	[...source.matchAll(pattern)].map((match) => match[1] as string);

/** The file a relative specifier names, however it was spelled. */
const fileAt = (path: string): string | undefined =>
	[path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`].find(
		(candidate) => existsSync(candidate) && statSync(candidate).isFile(),
	);

/**
 * Every entry point reachable from `entry`, following relative imports through
 * the module it starts in and stopping at each `webappwiz/` specifier, since
 * that names another entry point which answers for its own reach.
 */
const reaches = (entry: string): Set<string> => {
	const found = new Set<string>();
	const seen = new Set<string>();
	const queue = [resolve(import.meta.dir, entry)];
	while (queue.length > 0) {
		const path = queue.pop();
		if (path === undefined || seen.has(path)) {
			continue;
		}
		seen.add(path);
		const source = readFileSync(path, "utf8");
		for (const self of specifiers(source, SELF)) {
			found.add(`.${self.slice("webappwiz".length)}`);
		}
		for (const relative of specifiers(source, RELATIVE)) {
			const next = fileAt(resolve(dirname(path), relative));
			if (next !== undefined && !next.endsWith(".test.ts")) {
				queue.push(next);
			}
		}
	}
	return found;
};

describe("platform", () => {
	const exports = manifest.exports as Record<string, string>;

	it("names only entry points the manifest exports", () => {
		// A platform entry point spelled wrong here would be checked as though it
		// were neutral, which is the one way this file can pass and mean nothing.
		for (const name of Object.keys(PLATFORM)) {
			expect(Object.keys(exports)).toContain(name);
		}
	});

	it.each(Object.entries(exports).filter(([name]) => !(name in PLATFORM)))(
		"keeps %s free of anything that only runs somewhere",
		(name, path) => {
			const platform = [...reaches(path)]
				.filter((entry) => entry in PLATFORM)
				.map((entry) => `${entry} (${PLATFORM[entry]})`);

			expect(
				platform,
				`${name} runs anywhere, so it must not reach ${platform.join(", ")}`,
			).toEqual([]);
		},
	);
});

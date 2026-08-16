import { describe, expect, it } from "bun:test";
import { type Manifest, published } from "./published";

describe("published", () => {
	/** A package as the repository has it: source entry points, sibling ranges. */
	const manifest = (extra: Manifest = {}): Manifest => ({
		name: "@scope/time",
		version: "1.2.4",
		description: "Time as a seam",
		type: "module",
		module: "index.ts",
		exports: { ".": "./index.ts", "./testing": "./testing.ts" },
		files: ["**/*.ts"],
		scripts: { test: "bun test" },
		dependencies: { "@scope/disposable": "workspace:*", zod: "^3.0.0" },
		devDependencies: { typescript: "^7" },
		...extra,
	});

	it("points every export at the built pair, declarations first", () => {
		expect(published(manifest()).exports).toEqual({
			".": { types: "./index.d.ts", default: "./index.js" },
			"./testing": { types: "./testing.d.ts", default: "./testing.js" },
		});
	});

	it("names the main entry point for whoever does not read exports", () => {
		const out = published(manifest());

		expect(out.main).toBe("./index.js");
		expect(out.types).toBe("./index.d.ts");
		expect(out.module).toBeUndefined();
	});

	it("resolves siblings to the version going out, leaving the rest alone", () => {
		expect(published(manifest()).dependencies).toEqual({
			"@scope/disposable": "^1.2.4",
			zod: "^3.0.0",
		});
	});

	it("takes peers along, which a consumer installs too", () => {
		const out = published(
			manifest({ peerDependencies: { "@scope/log": "workspace:^" } }),
		);

		expect(out.peerDependencies).toEqual({ "@scope/log": "^1.2.4" });
	});

	it("leaves behind what only describes this repository", () => {
		const out = published(
			manifest({ private: false, workspaces: ["packages/*"] }),
		);

		for (const field of [
			"files",
			"scripts",
			"devDependencies",
			"private",
			"workspaces",
		]) {
			expect(out[field]).toBeUndefined();
		}
	});

	it("carries anything else across untouched", () => {
		const out = published(
			manifest({ keywords: ["time"], publishConfig: { access: "public" } }),
		);

		expect(out.description).toBe("Time as a seam");
		expect(out.type).toBe("module");
		expect(out.keywords).toEqual(["time"]);
		expect(out.publishConfig).toEqual({ access: "public" });
	});

	it("installs a command from the built file, not the source one", () => {
		const out = published(manifest({ bin: { time: "./index.ts" } }));

		expect(out.bin).toEqual({ time: "./index.js" });
	});

	it("takes a bin naming the package itself", () => {
		expect(published(manifest({ bin: "./cli.ts" })).bin).toBe("./cli.js");
	});

	it("keeps the conditions an export already carries", () => {
		const out = published(
			manifest({
				exports: { ".": { browser: "./browser.ts", default: "./index.ts" } },
			}),
		);

		expect(out.exports).toEqual({
			".": {
				browser: { types: "./browser.d.ts", default: "./browser.js" },
				default: { types: "./index.d.ts", default: "./index.js" },
			},
		});
	});

	it("leaves an export that names no source, having nothing to build", () => {
		const out = published(
			manifest({
				exports: { ".": "./index.ts", "./style.css": "./style.css" },
			}),
		);

		expect(out.exports).toEqual({
			".": { types: "./index.d.ts", default: "./index.js" },
			"./style.css": "./style.css",
		});
	});

	it("refuses a package with no version, which nothing could resolve", () => {
		expect(() => published({ name: "@scope/time" })).toThrow(
			"@scope/time has no version to publish",
		);
	});
});

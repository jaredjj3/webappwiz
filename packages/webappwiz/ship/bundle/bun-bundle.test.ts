import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { BunBundle } from "./bun-bundle";

describe("bun bundle", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let bundle: BunBundle;

	/** A package as the repository has it, at `/repo/packages/time`. */
	const written = async (manifest: object): Promise<void> => {
		await fs.mkdir("/repo/packages/time");
		await fs.write(
			"/repo/packages/time/package.json",
			JSON.stringify({ name: "@scope/time", version: "1.2.4", ...manifest }),
		);
	};

	/** The compiler call, which is the one naming every entry point. */
	const compiled = () =>
		ps.getCalls().find((call) => call.startsWith("bun build")) ?? "";

	beforeEach(() => {
		fs = new FakeFs();
		ps = new FakePs();
		bundle = new BunBundle({ fs, ps });
	});

	it("publishes from dist, not from the directory it built", async () => {
		await written({ exports: { ".": "./index.ts" } });

		expect(await bundle.build("/repo/packages/time")).toBe(
			"/repo/packages/time/dist",
		);
	});

	it("compiles every entry point the manifest names, exported or installed", async () => {
		await written({
			exports: { ".": "./index.ts", "./testing": "./testing.ts" },
			bin: { time: "./cli.ts" },
		});

		await bundle.build("/repo/packages/time");

		expect(compiled()).toContain("./index.ts ./testing.ts ./cli.ts");
		expect(compiled()).toContain("--splitting");
	});

	it("names an entry point once, however many ways it is reached", async () => {
		await written({ exports: { ".": "./index.ts" }, bin: "./index.ts" });

		await bundle.build("/repo/packages/time");

		expect(compiled().match(/\.\/index\.ts/g)).toHaveLength(1);
	});

	it("reaches through the conditions an export already carries", async () => {
		await written({
			exports: { ".": { browser: "./browser.ts", default: "./index.ts" } },
		});

		await bundle.build("/repo/packages/time");

		expect(compiled()).toContain("./browser.ts ./index.ts");
	});

	it("hands tsc the ambient declarations, which no tsconfig is there to", async () => {
		await written({ exports: { ".": "./index.ts" } });
		await fs.write("/repo/packages/time/md.d.ts", "declare module '*.md';");

		await bundle.build("/repo/packages/time");

		const tsc = ps.getCalls().find((call) => call.startsWith("bunx tsc")) ?? "";
		expect(tsc).toContain("./md.d.ts");
		expect(tsc).toContain("--ignoreConfig");
	});

	it("gives tsc a project root, which an entry point importing a sibling by package name needs", async () => {
		await written({
			exports: { ".": "./index.ts", "./log": "./log/index.ts" },
		});

		await bundle.build("/repo/packages/time");

		const tsc = ps.getCalls().find((call) => call.startsWith("bunx tsc")) ?? "";
		expect(tsc).toContain("--rootDir .");
	});

	it("writes the manifest the package publishes under", async () => {
		await written({
			exports: { ".": "./index.ts" },
			scripts: { test: "bun test" },
			dependencies: { "@scope/log": "workspace:*" },
		});

		await bundle.build("/repo/packages/time");

		const manifest = JSON.parse(
			await fs.read("/repo/packages/time/dist/package.json"),
		);
		expect(manifest.exports).toEqual({
			".": { types: "./index.d.ts", default: "./index.js" },
		});
		expect(manifest.dependencies).toEqual({ "@scope/log": "^1.2.4" });
		expect(manifest.scripts).toBeUndefined();
	});

	it("takes the documents npm would have taken from a package root", async () => {
		await written({ exports: { ".": "./index.ts" } });
		await fs.write("/repo/packages/time/README.md", "# time");
		await fs.write("/repo/packages/time/LICENSE", "MIT");

		await bundle.build("/repo/packages/time");

		expect(await fs.read("/repo/packages/time/dist/README.md")).toBe("# time");
		expect(await fs.read("/repo/packages/time/dist/LICENSE")).toBe("MIT");
		expect(await fs.exists("/repo/packages/time/dist/CHANGELOG.md")).toBe(
			false,
		);
	});

	it("runs a package's own build script before compiling it", async () => {
		await written({
			exports: { ".": "./index.ts" },
			scripts: { build: "make everything" },
		});

		await bundle.build("/repo/packages/time");

		// First, because what it makes is something the source then imports:
		// `arbor` builds the page it serves this way.
		expect(ps.getCalls()[0]).toBe("bun run build");
		expect(compiled()).toContain("./index.ts");
		expect(await fs.exists("/repo/packages/time/dist/package.json")).toBe(true);
	});

	it("points the declarations of a package that built itself, too", async () => {
		await written({
			exports: { ".": "./index.ts" },
			scripts: { build: "make everything" },
		});
		await fs.write(
			"/repo/packages/time/dist/index.d.ts",
			`export { Duration } from "./duration";`,
		);

		await bundle.build("/repo/packages/time");

		expect(await fs.read("/repo/packages/time/dist/index.d.ts")).toBe(
			`export { Duration } from "./duration.js";`,
		);
	});

	it("still publishes a package that exports nothing, having built nothing", async () => {
		await written({});

		expect(await bundle.build("/repo/packages/time")).toBe(
			"/repo/packages/time/dist",
		);
		expect(ps.getCalls()).toEqual([]);
		expect(await fs.exists("/repo/packages/time/dist/package.json")).toBe(true);
	});

	it("throws on a package that does not build, before anything publishes", async () => {
		await written({ exports: { ".": "./index.ts" } });
		ps.simulate(async () => 1);

		await expect(bundle.build("/repo/packages/time")).rejects.toThrow(
			"failed in /repo/packages/time",
		);
	});

	it("points every relative specifier in the declarations at a .js file", async () => {
		await written({ exports: { ".": "./index.ts" } });
		await fs.write(
			"/repo/packages/time/dist/index.d.ts",
			[
				`export type { Clock } from "./clock/clock";`,
				`import { Duration } from "./duration";`,
				`export declare const later: import("./timer/timer").Timer;`,
				`import { type Logger } from "@scope/log";`,
				`export type { Json } from "./json.js";`,
			].join("\n"),
		);

		await bundle.build("/repo/packages/time");

		expect(await fs.read("/repo/packages/time/dist/index.d.ts")).toBe(
			[
				`export type { Clock } from "./clock/clock.js";`,
				`import { Duration } from "./duration.js";`,
				`export declare const later: import("./timer/timer.js").Timer;`,
				// A bare specifier is a package, and resolves without help.
				`import { type Logger } from "@scope/log";`,
				// One that already names a file is left as it is.
				`export type { Json } from "./json.js";`,
			].join("\n"),
		);
	});

	it("leaves the JavaScript beside the declarations alone", async () => {
		await written({ exports: { ".": "./index.ts" } });
		const js = `export { Duration } from "./duration";\n`;
		await fs.write("/repo/packages/time/dist/index.js", js);

		await bundle.build("/repo/packages/time");

		expect(await fs.read("/repo/packages/time/dist/index.js")).toBe(js);
	});

	it("clears what a build left, so nothing of it is checked in", async () => {
		await fs.mkdir("/repo/packages/time/dist");
		await fs.write("/repo/packages/time/dist/index.js", "built");

		await bundle.clean("/repo/packages/time");

		expect(await fs.exists("/repo/packages/time/dist")).toBe(false);
	});
});

import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { defineStyleGuide, rule } from "@webappwiz/style";
import { FakeFs } from "@webappwiz/sys/testing";
import { check, compileGuide } from "./style";
import { ruleDoc } from "./testing";

describe("compileGuide", () => {
	let fs: FakeFs;

	beforeEach(async () => {
		fs = new FakeFs();
		await fs.mkdir("/g/rules");
		await fs.write("/g/rules/one.md", ruleDoc("One"));
	});

	it("resolves rule paths relative to the guide, reports them as written", async () => {
		const guide = defineStyleGuide([rule("./rules/one.md")]);

		const { rules, diagnostics } = await compileGuide(guide, "/g", fs);

		expect(diagnostics).toEqual([]);
		expect(rules.map((r) => [r.name, r.path])).toEqual([
			["One", "./rules/one.md"],
		]);
	});

	it("turns an unreadable rule file into an error, not a crash", async () => {
		const guide = defineStyleGuide([rule("./rules/gone.md")]);

		const { rules, diagnostics } = await compileGuide(guide, "/g", fs);

		expect(rules).toEqual([]);
		expect(diagnostics).toEqual([
			{
				path: "./rules/gone.md",
				severity: "error",
				message: "cannot read rule file",
			},
		]);
	});

	it("catches duplicate names across files", async () => {
		await fs.write("/g/rules/two.md", ruleDoc("One"));
		const guide = defineStyleGuide([
			rule("./rules/one.md"),
			rule("./rules/two.md"),
		]);

		const { diagnostics } = await compileGuide(guide, "/g", fs);

		expect(diagnostics.map((d) => d.message)).toEqual([
			'duplicate rule name "One" (also ./rules/one.md)',
		]);
	});
});

describe("check", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const printed = () => log.entries.map((e) => String(e.message)).join("\n");
	const load = async () => ({
		guide: defineStyleGuide([rule("./one.md")]),
		dir: "/g",
	});

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/g");
	});

	it("declares a sound guide sound", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await check({ rules: "guide.ts", strict: false }, log, fs, load);

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("prints diagnostics compiler-style and throws on errors", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(
			check({ rules: "guide.ts", strict: false }, log, fs, load),
		).rejects.toThrow("3 errors, 1 warning");
		expect(printed()).toContain(
			'./one.md  error    missing "files" glob in frontmatter',
		);
		expect(printed()).toContain("./one.md  warning  no ## Bad section");
	});

	it("promotes warnings under strict", async () => {
		const noBad = ruleDoc("One").split("\n## Bad")[0] ?? "";
		await fs.write("/g/one.md", noBad);

		await check({ rules: "guide.ts", strict: false }, log, fs, load);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		expect(
			check({ rules: "guide.ts", strict: true }, log, fs, load),
		).rejects.toThrow("0 errors, 1 warning");
	});
});

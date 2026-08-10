import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { defineStyleGuide, rule, type StyleGuide } from "@webappwiz/style";
import { FakeFs } from "@webappwiz/sys/testing";
import { StyleCommands } from "./style";
import { ruleDoc } from "./testing";

describe("StyleCommands", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const printed = () => log.entries.map((e) => String(e.message)).join("\n");
	const commands = (guide: StyleGuide, dir = "/g") =>
		new StyleCommands(log, fs, { load: async () => ({ guide, dir }) });
	const oneRule = defineStyleGuide([rule("./one.md")]);

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/g/rules");
		await fs.mkdir("/p");
	});

	it("declares a sound guide sound", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await commands(oneRule).check({ rules: "style.ts", strict: false });

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("resolves rule paths relative to the guide module", async () => {
		await fs.write("/g/rules/one.md", ruleDoc("One"));
		const guide = defineStyleGuide([rule("./rules/one.md")]);

		await commands(guide).check({ rules: "style.ts", strict: false });

		expect(printed()).toContain("sound");
	});

	it("turns an unreadable rule file into an error instead of a crash", async () => {
		const guide = defineStyleGuide([rule("./gone.md")]);

		expect(
			commands(guide).check({ rules: "style.ts", strict: false }),
		).rejects.toThrow("1 error, 0 warnings");
		expect(printed()).toContain("./gone.md  error  cannot read rule file");
	});

	it("catches duplicate rule names across files", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/g/two.md", ruleDoc("One"));
		const guide = defineStyleGuide([rule("./one.md"), rule("./two.md")]);

		expect(
			commands(guide).check({ rules: "style.ts", strict: false }),
		).rejects.toThrow("1 error");
		expect(printed()).toContain('duplicate rule name "One" (also ./one.md)');
	});

	it("prints diagnostics compiler-style and throws when there are errors", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(
			commands(oneRule).check({ rules: "style.ts", strict: false }),
		).rejects.toThrow("3 errors, 1 warning");
		expect(printed()).toContain(
			'./one.md  error    missing "files" glob in frontmatter',
		);
		expect(printed()).toContain("./one.md  warning  no ## Bad section");
	});

	it("promotes warnings to failures under strict", async () => {
		const noBad = ruleDoc("One").split("\n## Bad")[0] ?? "";
		await fs.write("/g/one.md", noBad);

		await commands(oneRule).check({ rules: "style.ts", strict: false });
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		expect(
			commands(oneRule).check({ rules: "style.ts", strict: true }),
		).rejects.toThrow("0 errors, 1 warning");
	});

	it("shows each rule as a table row when showing", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await commands(oneRule).show({ rules: "style.ts" });

		expect(printed()).toContain("RULE  FILES");
		expect(printed()).toContain("One");
		expect(printed()).toContain("./one.md");
	});

	it("prints the analysis plan for a sound guide", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({
			rules: "style.ts",
			dir: "/p",
			json: false,
			chunk: 25,
		});

		expect(printed()).toContain("## Task 1 of 1: One");
	});

	it("prints a machine-readable plan when asked for json", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({
			rules: "style.ts",
			dir: "/p",
			json: true,
			chunk: 25,
		});

		const out = JSON.parse(String(log.entries[0]?.message));
		expect(out.rules).toEqual(["One"]);
		expect(out.tasks[0].files).toEqual(["a.ts"]);
	});

	it("refuses to analyze with an unsound guide", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(
			commands(oneRule).analyze({
				rules: "style.ts",
				dir: "/p",
				json: false,
				chunk: 25,
			}),
		).rejects.toThrow("3 errors");
	});
});

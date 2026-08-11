import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { defineStyleGuide, rule, type StyleGuide } from "@webappwiz/style";
import { ruleDoc } from "@webappwiz/style/testing";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { StyleCommands } from "./style";

describe("StyleCommands", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((e) => String(e.message)).join("\n"));
	const commands = (guide: StyleGuide, dir = "/g") =>
		new StyleCommands(log, fs, ps, clock, {
			load: async () => ({ guide, dir }),
		});
	const oneRule = defineStyleGuide([rule("./one.md")]);
	const config = "style.config.ts";
	const analyzing = { rules: config, dir: "/p", agent: "haiku", chunk: 25 };

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		await fs.mkdir("/g/rules");
		await fs.mkdir("/p");
	});

	it("declares a sound guide sound", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await commands(oneRule).check({ rules: config, strict: false });

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("resolves rule paths relative to the guide module", async () => {
		await fs.write("/g/rules/one.md", ruleDoc("One"));
		const guide = defineStyleGuide([rule("./rules/one.md")]);

		await commands(guide).check({ rules: config, strict: false });

		expect(printed()).toContain("sound");
	});

	it("turns an unreadable rule file into an error instead of a crash", async () => {
		const guide = defineStyleGuide([rule("./gone.md")]);

		expect(
			commands(guide).check({ rules: config, strict: false }),
		).rejects.toThrow("1 error, 0 warnings");
		expect(printed()).toContain("./gone.md  error  cannot read rule file");
	});

	it("catches duplicate rule names across files", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/g/two.md", ruleDoc("One"));
		const guide = defineStyleGuide([rule("./one.md"), rule("./two.md")]);

		expect(
			commands(guide).check({ rules: config, strict: false }),
		).rejects.toThrow("1 error");
		expect(printed()).toContain('duplicate rule name "One" (also ./one.md)');
	});

	it("prints diagnostics compiler-style and throws when there are errors", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(
			commands(oneRule).check({ rules: config, strict: false }),
		).rejects.toThrow("3 errors, 1 warning");
		expect(printed()).toContain(
			'./one.md  error    missing "files" glob in frontmatter',
		);
		expect(printed()).toContain("./one.md  warning  no ## Bad section");
	});

	it("promotes warnings to failures under strict", async () => {
		const noBad = ruleDoc("One").split("\n## Bad")[0] ?? "";
		await fs.write("/g/one.md", noBad);

		await commands(oneRule).check({ rules: config, strict: false });
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		expect(
			commands(oneRule).check({ rules: config, strict: true }),
		).rejects.toThrow("0 errors, 1 warning");
	});

	it("shows each rule as a table row when showing", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await commands(oneRule).ls({ rules: config });

		expect(printed()).toContain("ID   RULE  LEVEL  FILES");
		expect(printed()).toContain("one  One   error");
		expect(printed()).toContain("./one.md");
	});

	it("prints one rule in full when shown its id", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await commands(oneRule).show({ id: "one", rules: config });

		expect(printed()).toContain("ID     one");
		expect(printed()).toContain("LEVEL  error");
		expect(printed()).toContain("# One"); // the document itself, verbatim
		expect(printed()).toContain("## Bad");
	});

	it("lists the ids it does know when shown one it does not", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		expect(
			commands(oneRule).show({ id: "two", rules: config }),
		).rejects.toThrow('no rule "two" in style.config.ts. Known ids: one');
	});

	it("prints what the agent found as lint output", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}\nclass B {}");
		ps.setCaptureOutput(
			'[{"file": "a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		expect(commands(oneRule).analyze(analyzing)).rejects.toThrow(
			"1 style error",
		);
		expect(printed()).toContain("✗ [1/1] One (one): 1 problem");
		expect(printed()).toContain(
			"/p/a.ts:2  error  the file declares a second class",
		);
		expect(printed()).toContain("│ class B {}");
	});

	it("says the code conforms when the agent finds nothing", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toContain("no style violations");
	});

	it("times each rule and the run as a whole", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(12.5));
			return 0;
		});

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toContain("clean in 12.5s");
		expect(printed()).toContain("no style violations in 12.5s");
	});

	it("reports warnings without failing the run", async () => {
		await fs.write("/g/one.md", ruleDoc("One", "**/*.ts", "warning"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput(
			'[{"file": "a.ts", "line": 1, "message": "the class has no doc comment"}]',
			"",
		);

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toContain("/p/a.ts:1  warning  the class has no doc");
	});

	it("runs the model an --agent shorthand names", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(ps.getCalls()[0]).toStartWith("claude -p --model haiku ");
		expect(printed()).toContain("using: claude -p --model haiku");
	});

	it("runs an --exec command through a shell instead", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze({
			...analyzing,
			agent: undefined,
			exec: "codex exec",
		});

		expect(ps.getCalls()[0]).toStartWith('sh -c codex exec "$@" sh ');
	});

	it("prints the prompts and spawns nothing under --prompt", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({ ...analyzing, prompt: true });

		expect(printed()).toContain("=== one One (1 file) ===");
		expect(printed()).toContain("exactly one style rule");
		expect(printed()).toContain("- a.ts");
		expect(ps.getCalls()).toEqual([]);
	});

	it("refuses to analyze with an unsound guide", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(commands(oneRule).analyze(analyzing)).rejects.toThrow("3 errors");
	});
});

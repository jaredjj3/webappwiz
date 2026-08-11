import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import { defineStyleGuide, rule, type StyleGuide } from "@webappwiz/style";
import { ruleDoc } from "@webappwiz/style/testing";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { type Confirm, StyleCommands } from "./style";

describe("StyleCommands", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((e) => String(e.message)).join("\n"));
	const commands = (guide: StyleGuide, dir = "/g", confirm?: Confirm) =>
		new StyleCommands(
			log,
			fs,
			ps,
			clock,
			{ load: async () => ({ guide, dir }) },
			confirm,
		);
	const oneRule = defineStyleGuide([rule("./one.md")]);
	const config = "style.config.ts";
	// budget high enough that only the tests about budgets ever meet it
	const analyzing = {
		rules: config,
		dir: "/p",
		agent: "haiku",
		chunk: 25,
		budget: 1_000_000,
	};

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		await fs.mkdir("/g/rules");
		await fs.mkdir("/p");
	});

	// the answer an agent gives about a rule nothing but an agent could enforce
	const needsAgent = { rules: config, strict: false, agent: "haiku" };

	it("declares a sound guide sound", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		ps.setCaptureOutput('{"tool": null}', "");

		await commands(oneRule).audit(needsAgent);

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("resolves rule paths relative to the guide module", async () => {
		await fs.write("/g/rules/one.md", ruleDoc("One"));
		ps.setCaptureOutput('{"tool": null}', "");
		const guide = defineStyleGuide([rule("./rules/one.md")]);

		await commands(guide).audit(needsAgent);

		expect(printed()).toContain("sound");
	});

	it("turns an unreadable rule file into an error instead of a crash", async () => {
		const guide = defineStyleGuide([rule("./gone.md")]);

		expect(commands(guide).audit(needsAgent)).rejects.toThrow(
			"1 error, 0 warnings",
		);
		expect(printed()).toContain("./gone.md  error  cannot read rule file");
		expect(ps.getCalls()).toEqual([]);
	});

	it("catches duplicate rule names across files", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/g/two.md", ruleDoc("One"));
		const guide = defineStyleGuide([rule("./one.md"), rule("./two.md")]);

		expect(commands(guide).audit(needsAgent)).rejects.toThrow("1 error");
		expect(printed()).toContain('duplicate rule name "One" (also ./one.md)');
	});

	it("prints diagnostics compiler-style and throws when there are errors", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(commands(oneRule).audit(needsAgent)).rejects.toThrow(
			"3 errors, 1 warning",
		);
		expect(printed()).toContain(
			'./one.md  error    missing "files" glob in frontmatter',
		);
		expect(printed()).toContain("./one.md  warning  no ## Bad section");
	});

	it("promotes warnings to failures under strict", async () => {
		const noBad = ruleDoc("One").split("\n## Bad")[0] ?? "";
		await fs.write("/g/one.md", noBad);
		ps.setCaptureOutput('{"tool": null}', "");

		await commands(oneRule).audit(needsAgent);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		expect(
			commands(oneRule).audit({ ...needsAgent, strict: true }),
		).rejects.toThrow("0 errors, 1 warning");
	});

	it("audits rules and warns about the ones a tool could enforce", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		ps.setCaptureOutput('{"tool": "biome", "reason": "a regex"}', "");

		await commands(oneRule).audit({
			rules: config,
			strict: false,
			agent: "haiku",
		});

		expect(printed()).toContain(
			"biome could enforce this without an agent: a regex",
		);
		expect(printed()).toContain("0 errors, 1 warning");
	});

	it("refuses to audit without an agent to ask", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		expect(
			commands(oneRule).audit({ rules: config, strict: false }),
		).rejects.toThrow("audit asks an agent, so name one");
		expect(ps.getCalls()).toEqual([]);
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

	it("says what the run will read before it reads any of it", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toMatch(/reading \d[\d.]*K?\+ tokens/);
	});

	it("spawns nothing when the estimate is over budget and nobody says go", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		expect(
			commands(oneRule, "/g", () => false).analyze({
				...analyzing,
				budget: 10,
			}),
		).rejects.toThrow("over budget");
		expect(printed()).toContain("over the 10 budget");
		expect(ps.getCalls()).toEqual([]);
	});

	it("runs over budget once the caller says go", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule, "/g", () => true).analyze({
			...analyzing,
			budget: 10,
		});

		expect(ps.getCalls()).toHaveLength(1);
		expect(printed()).toContain("no style violations");
	});

	it("checks only what changed when --since names a ref", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		await fs.write("/p/b.ts", "class B {}");
		ps.setCaptureOutput("a.ts\n", "");

		await commands(oneRule).analyze({
			...analyzing,
			since: "main",
			prompt: true,
		});

		expect(printed()).toContain("=== one One (1 file) ===");
		expect(printed()).toContain("- a.ts");
		expect(printed()).not.toContain("- b.ts");
	});

	it("prints what a run would read and spawns nothing under --estimate", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({
			...analyzing,
			agent: undefined,
			estimate: true,
		});

		expect(printed()).toMatch(
			/^checking 1 file against 1 rule in 1 agent call, reading \d[\d.]*K?\+ tokens$/m,
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("names no agent under --estimate, having none to run", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({
			...analyzing,
			agent: undefined,
			estimate: true,
		});

		expect(printed()).not.toContain("using:");
	});

	it("measures only what changed when --estimate is given a --since", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		await fs.write("/p/b.ts", "class B {}");
		ps.setCaptureOutput("a.ts\n", "");

		await commands(oneRule).analyze({
			...analyzing,
			agent: undefined,
			estimate: true,
			since: "main",
		});

		expect(printed()).toContain("checking 1 file against 1 rule");
	});

	it("refuses --estimate together with a flag naming something to run", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		const commanded = commands(oneRule);

		for (const naming of [
			{ agent: "haiku" },
			{ agent: undefined, exec: "codex exec" },
			{ agent: undefined, prompt: true },
		]) {
			expect(
				commanded.analyze({ ...analyzing, estimate: true, ...naming }),
			).rejects.toThrow("--estimate measures a run instead of making one");
		}
	});

	it("says so and stops when nothing has changed since the ref", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("", "");

		await commands(oneRule).analyze({ ...analyzing, since: "main" });

		expect(printed()).toContain("nothing has changed since main");
		expect(ps.getCalls()).not.toContain("claude -p --model haiku");
	});
});

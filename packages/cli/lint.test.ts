import { beforeEach, describe, expect, it } from "bun:test";
import { defineGuide, type Guide } from "@webappwiz/lint";
import { ruleDoc, testRule } from "@webappwiz/lint/testing";
import { color, MemoryLogger } from "@webappwiz/log";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { type Confirm, LintCommands } from "./lint";

describe("LintCommands", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((e) => String(e.message)).join("\n"));
	const commands = (guide: Guide, confirm?: Confirm) =>
		new LintCommands(log, fs, ps, clock, { load: async () => guide }, confirm);
	const one = (document = ruleDoc("One")) => testRule("one", { document });
	const oneRule = defineGuide([one()]);
	const config = "lint.config.ts";
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
		await fs.mkdir("/p");
	});

	// the answer an agent gives about a rule nothing but an agent could enforce
	const needsAgent = { rules: config, strict: false, agent: "haiku" };
	const soundly = { rules: config, strict: false, sound: true };

	it("declares a sound guide sound", async () => {
		await commands(oneRule).audit(soundly);

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("asks nothing of an agent when checking soundness alone", async () => {
		await commands(oneRule).audit(soundly);

		expect(ps.getCalls()).toEqual([]);
	});

	it("catches two rules answering to the same id", async () => {
		const guide = defineGuide([one(), one()]);

		expect(commands(guide).audit(soundly)).rejects.toThrow("1 error");
		expect(printed()).toContain('duplicate rule id "one"');
	});

	it("prints diagnostics compiler-style and throws when there are errors", async () => {
		const guide = defineGuide([one("just prose\n")]);

		expect(commands(guide).audit(soundly)).rejects.toThrow(
			"2 errors, 1 warning",
		);
		expect(printed()).toContain("one  error    missing title (# heading)");
		expect(printed()).toContain("one  warning  no ## Bad section");
	});

	it("promotes warnings to failures under strict", async () => {
		const guide = defineGuide([one(ruleDoc("One").split("\n## Bad")[0] ?? "")]);

		await commands(guide).audit(soundly);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		expect(commands(guide).audit({ ...soundly, strict: true })).rejects.toThrow(
			"0 errors, 1 warning",
		);
	});

	it("audits rules and warns about the ones a tool could enforce", async () => {
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
		expect(
			commands(oneRule).audit({ rules: config, strict: false }),
		).rejects.toThrow("audit asks an agent, so name one");
		expect(ps.getCalls()).toEqual([]);
	});

	it("names no agent under sound, having none to run", async () => {
		expect(
			commands(oneRule).audit({ ...soundly, agent: "haiku" }),
		).rejects.toThrow("--sound checks the guide compiles and runs no agent");
	});

	it("shows each rule as a table row when showing", async () => {
		await commands(oneRule).ls({ rules: config });

		expect(printed()).toContain("ID   RULE  LEVEL  FILES");
		expect(printed()).toContain("one  One   error");
	});

	it("prints one rule in full when shown its id", async () => {
		await commands(oneRule).show({ id: "one", rules: config });

		expect(printed()).toContain("ID     one");
		expect(printed()).toContain("LEVEL  error");
		expect(printed()).toContain("# One"); // the document itself, verbatim
		expect(printed()).toContain("## Bad");
	});

	it("lists the ids it does know when shown one it does not", async () => {
		expect(
			commands(oneRule).show({ id: "two", rules: config }),
		).rejects.toThrow('no rule "two" in lint.config.ts. Known ids: one');
	});

	it("prints what the agent found as lint output", async () => {
		await fs.write("/p/a.ts", "class A {}\nclass B {}");
		ps.setCaptureOutput(
			'[{"file": "a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		expect(commands(oneRule).analyze(analyzing)).rejects.toThrow(
			"1 lint error",
		);
		expect(printed()).toContain("✗ [1/1] One (one): 1 problem");
		expect(printed()).toContain(
			"/p/a.ts:2  error  the file declares a second class",
		);
		expect(printed()).toContain("│ class B {}");
	});

	it("says the code conforms when the agent finds nothing", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toContain("no violations");
	});

	it("times each rule and the run as a whole", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(12.5));
			return 0;
		});

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toContain("clean in 12.5s");
		expect(printed()).toContain("no violations in 12.5s");
	});

	it("reports warnings without failing the run", async () => {
		const guide = defineGuide([
			testRule("one", { document: ruleDoc("One"), level: "warning" }),
		]);
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput(
			'[{"file": "a.ts", "line": 1, "message": "the class has no doc comment"}]',
			"",
		);

		await commands(guide).analyze(analyzing);

		expect(printed()).toContain("/p/a.ts:1  warning  the class has no doc");
	});

	it("runs the model an --agent shorthand names", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(ps.getCalls()[0]).toStartWith("claude -p --model haiku ");
		expect(printed()).toContain("using: claude -p --model haiku");
	});

	it("runs an --exec command through a shell instead", async () => {
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
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({ ...analyzing, prompt: true });

		expect(printed()).toContain("=== one One (1 file) ===");
		expect(printed()).toContain("exactly one style rule");
		expect(printed()).toContain("- a.ts");
		expect(ps.getCalls()).toEqual([]);
	});

	it("leaves fully checked rules to the linter, analyzing the rest", async () => {
		await fs.write("/p/a.ts", "class A {}");
		const guide = defineGuide([
			testRule("one", { document: ruleDoc("One"), check: () => [] }),
			testRule("two", {
				document: ruleDoc("Two"),
				check: () => [],
				partial: true,
			}),
			testRule("three", { document: ruleDoc("Three") }),
		]);

		await commands(guide).analyze({ ...analyzing, prompt: true });

		// a partial check's rule still needs the agent; a full check's does not
		expect(printed()).not.toContain("=== one");
		expect(printed()).toContain("=== two");
		expect(printed()).toContain("=== three");
	});

	it("audits only the rules no check enforces", async () => {
		const guide = defineGuide([
			testRule("one", { document: ruleDoc("One"), check: () => [] }),
		]);

		await commands(guide).audit(needsAgent);

		expect(ps.getCalls()).toEqual([]);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("refuses to analyze with an unsound guide", async () => {
		const guide = defineGuide([one("just prose\n")]);

		expect(commands(guide).analyze(analyzing)).rejects.toThrow("2 errors");
	});

	it("says what the run will read before it reads any of it", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).analyze(analyzing);

		expect(printed()).toMatch(/reading \d[\d.]*K?\+ tokens/);
	});

	it("spawns nothing when the estimate is over budget and nobody says go", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		expect(
			commands(oneRule, () => false).analyze({
				...analyzing,
				budget: 10,
			}),
		).rejects.toThrow("over budget");
		expect(printed()).toContain("over the 10 budget");
		expect(ps.getCalls()).toEqual([]);
	});

	it("runs over budget once the caller says go", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule, () => true).analyze({
			...analyzing,
			budget: 10,
		});

		expect(ps.getCalls()).toHaveLength(1);
		expect(printed()).toContain("no violations");
	});

	it("checks only what changed when --since names a ref", async () => {
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
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).analyze({
			...analyzing,
			agent: undefined,
			estimate: true,
		});

		expect(printed()).not.toContain("using:");
	});

	it("measures only what changed when --estimate is given a --since", async () => {
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
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("", "");

		await commands(oneRule).analyze({ ...analyzing, since: "main" });

		expect(printed()).toContain("nothing has changed since main");
		expect(ps.getCalls()).not.toContain("claude -p --model haiku");
	});
});

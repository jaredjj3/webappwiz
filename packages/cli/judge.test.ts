import { beforeEach, describe, expect, it } from "bun:test";
import { type Config, defineJudge, SECTION } from "@webappwiz/judge";
import { ruleDoc, testRule } from "@webappwiz/judge/testing";
import { color, MemoryLogger } from "@webappwiz/log";
import { FakeConfigLoader } from "@webappwiz/rules";
import { NodeGlob } from "@webappwiz/sys";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { type Confirm, JudgeCommands } from "./judge";

describe("JudgeCommands", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));
	const commands = (config: Config, confirm?: Confirm) =>
		new JudgeCommands(
			log,
			fs,
			ps,
			clock,
			new NodeGlob(),
			new FakeConfigLoader({ [SECTION]: config }),
			confirm,
		);
	const one = (document = ruleDoc("One")) => testRule("one", { document });
	const oneRule = defineJudge({ rules: [one()] });
	const config = "rules.config.ts";
	// budget high enough that only the tests about budgets ever meet it
	const judging = {
		config: config,
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
	const needsAgent = { config: config, strict: false, agent: "haiku" };
	const noTool = () => ps.setCaptureOutput('{"tool": null}', "");

	it("declares a sound config sound", async () => {
		noTool();

		await commands(oneRule).audit(needsAgent);

		expect(printed()).toBe("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("asks nothing of an agent when the config will not compile", async () => {
		const config = defineJudge({ rules: [one("just prose\n")] });

		await expect(commands(config).audit(needsAgent)).rejects.toThrow(
			"2 errors",
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("catches two rules answering to the same id", async () => {
		const config = defineJudge({ rules: [one(), one()] });

		await expect(commands(config).audit(needsAgent)).rejects.toThrow("1 error");
		expect(printed()).toContain('duplicate rule id "one"');
	});

	it("prints diagnostics compiler-style and throws when there are errors", async () => {
		const config = defineJudge({ rules: [one("just prose\n")] });

		await expect(commands(config).audit(needsAgent)).rejects.toThrow(
			"2 errors, 1 warning",
		);
		expect(printed()).toContain("one  error    missing title (# heading)");
		expect(printed()).toContain("one  warning  no ## Bad section");
	});

	it("promotes warnings to failures under strict", async () => {
		const config = defineJudge({
			rules: [one(ruleDoc("One").split("\n## Bad")[0] ?? "")],
		});
		noTool();

		await commands(config).audit(needsAgent);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 1 warning");

		await expect(
			commands(config).audit({ ...needsAgent, strict: true }),
		).rejects.toThrow("0 errors, 1 warning");
	});

	it("audits rules and warns about the ones a tool could enforce", async () => {
		ps.setCaptureOutput('{"tool": "biome", "reason": "a regex"}', "");

		await commands(oneRule).audit(needsAgent);

		expect(printed()).toContain(
			"biome could enforce this without an agent: a regex",
		);
		expect(printed()).toContain("0 errors, 1 warning");
	});

	it("asks the config's agent when told no other", async () => {
		noTool();

		await commands(oneRule).audit({ config: config, strict: false });

		expect(ps.getCalls()[0]).toContain("haiku");
	});

	it("shows each rule as a table row when showing", async () => {
		await commands(oneRule).ls({ config: config });

		expect(printed()).toContain("ID   RULE  LEVEL  FILES");
		expect(printed()).toContain("one  One   error");
	});

	it("prints one rule in full when shown its id", async () => {
		await commands(oneRule).show({ id: "one", config: config });

		expect(printed()).toContain("ID     one");
		expect(printed()).toContain("LEVEL  error");
		expect(printed()).toContain("# One"); // the document itself, verbatim
		expect(printed()).toContain("## Bad");
	});

	it("lists the ids it does know when shown one it does not", async () => {
		expect(
			commands(oneRule).show({ id: "two", config: config }),
		).rejects.toThrow('no rule "two" in rules.config.ts. Known ids: one');
	});

	it("prints what the agent found as a report of its own", async () => {
		await fs.write("/p/a.ts", "class A {}\nclass B {}");
		ps.setCaptureOutput(
			'[{"rule": "one", "file": "a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		expect(commands(oneRule).judge(judging)).rejects.toThrow("1 error");
		expect(printed()).toContain("✗ [1/1] **/*.ts (1 rule): 1 problem");
		expect(printed()).toContain(
			"/p/a.ts:2  error  the file declares a second class (one)",
		);
		expect(printed()).toContain("│ class B {}");
	});

	it("says the code conforms when the agent finds nothing", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge(judging);

		expect(printed()).toContain("no violations");
	});

	it("times each rule and the run as a whole", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(12.5));
			return 0;
		});

		await commands(oneRule).judge(judging);

		expect(printed()).toContain("clean in 12.5s");
		expect(printed()).toContain("no violations in 12.5s");
	});

	it("reports warnings without failing the run", async () => {
		const config = defineJudge({
			rules: [testRule("one", { document: ruleDoc("One"), level: "warning" })],
		});
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput(
			'[{"rule": "one", "file": "a.ts", "line": 1, "message": "the class has no doc comment"}]',
			"",
		);

		await commands(config).judge(judging);

		expect(printed()).toContain("/p/a.ts:1  warning  the class has no doc");
	});

	it("runs the model an --agent shorthand names", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge(judging);

		expect(ps.getCalls()[0]).toStartWith(
			"claude -p --output-format json --model haiku ",
		);
		expect(printed()).toContain(
			"using: claude -p --output-format json --model haiku",
		);
	});

	it("runs an --exec command through a shell instead", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge({
			...judging,
			agent: undefined,
			exec: "codex exec",
		});

		expect(ps.getCalls()[0]).toStartWith('sh -c codex exec "$@" sh ');
	});

	it("prints the prompts and spawns nothing under --prompt", async () => {
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).judge({ ...judging, prompt: true });

		expect(printed()).toContain("=== **/*.ts: one (1 file) ===");
		expect(printed()).toContain("exactly 1 rule");
		expect(printed()).toContain("- a.ts");
		expect(ps.getCalls()).toEqual([]);
	});

	it("leaves fully checked rules to the linter, judging the rest", async () => {
		await fs.write("/p/a.ts", "class A {}");
		const config = defineJudge({
			rules: [
				testRule("one", { document: ruleDoc("One"), check: () => [] }),
				testRule("two", {
					document: ruleDoc("Two"),
					check: () => [],
					partial: true,
				}),
				testRule("three", { document: ruleDoc("Three") }),
			],
		});

		await commands(config).judge({ ...judging, prompt: true });

		// a partial check's rule still needs the agent; a full check's does not,
		// and the two survivors share their glob's one task
		expect(printed()).toContain("=== **/*.ts: two, three (1 file) ===");
		expect(printed()).not.toContain("Rule `one`");
	});

	it("audits only the rules no check enforces", async () => {
		const config = defineJudge({
			rules: [testRule("one", { document: ruleDoc("One"), check: () => [] })],
		});

		await commands(config).audit(needsAgent);

		expect(ps.getCalls()).toEqual([]);
		expect(printed()).toContain("sound: 1 rule, 0 errors, 0 warnings");
	});

	it("refuses to judge with an unsound config", async () => {
		const config = defineJudge({ rules: [one("just prose\n")] });

		expect(commands(config).judge(judging)).rejects.toThrow("2 errors");
	});

	it("says what the run will read before it reads any of it", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge(judging);

		expect(printed()).toMatch(/reading \d[\d.]*K?\+ tokens/);
	});

	it("spawns nothing when the estimate is over budget and nobody says go", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		expect(
			commands(oneRule, { confirm: () => false }).judge({
				...judging,
				budget: 10,
			}),
		).rejects.toThrow("over budget");
		expect(printed()).toContain("over the 10 budget");
		expect(ps.getCalls()).toEqual([]);
	});

	it("runs over budget once the caller says go", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule, { confirm: () => true }).judge({
			...judging,
			budget: 10,
		});

		expect(ps.getCalls()).toHaveLength(1);
		expect(printed()).toContain("no violations");
	});

	it("checks only what changed when --since names a ref", async () => {
		await fs.write("/p/a.ts", "class A {}");
		await fs.write("/p/b.ts", "class B {}");
		ps.setCaptureOutput("a.ts\n", "");

		await commands(oneRule).judge({
			...judging,
			since: "main",
			prompt: true,
		});

		expect(printed()).toContain("=== **/*.ts: one (1 file) ===");
		expect(printed()).toContain("- a.ts");
		expect(printed()).not.toContain("- b.ts");
	});

	it("prints what a run would read and spawns nothing under --estimate", async () => {
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).judge({
			...judging,
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

		await commands(oneRule).judge({
			...judging,
			agent: undefined,
			estimate: true,
		});

		expect(printed()).not.toContain("using:");
	});

	it("measures only what changed when --estimate is given a --since", async () => {
		await fs.write("/p/a.ts", "class A {}");
		await fs.write("/p/b.ts", "class B {}");
		ps.setCaptureOutput("a.ts\n", "");

		await commands(oneRule).judge({
			...judging,
			agent: undefined,
			estimate: true,
			since: "main",
		});

		expect(printed()).toContain("checking 1 file against 1 rule");
	});

	it("refuses --estimate together with --agent", async () => {
		await expect(
			commands(oneRule).judge({
				...judging,
				estimate: true,
				agent: "haiku",
			}),
		).rejects.toThrow("--estimate measures a run instead of making one");
	});

	it("refuses --estimate together with --exec", async () => {
		await expect(
			commands(oneRule).judge({
				...judging,
				estimate: true,
				agent: undefined,
				exec: "codex exec",
			}),
		).rejects.toThrow("--estimate measures a run instead of making one");
	});

	it("refuses --estimate together with --prompt", async () => {
		await expect(
			commands(oneRule).judge({
				...judging,
				estimate: true,
				agent: undefined,
				prompt: true,
			}),
		).rejects.toThrow("--estimate measures a run instead of making one");
	});

	it("says so and stops when nothing has changed since the ref", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("", "");

		await commands(oneRule).judge({ ...judging, since: "main" });

		expect(printed()).toContain("nothing has changed since main");
		expect(ps.getCalls()).not.toContain(
			"claude -p --output-format json --model haiku",
		);
	});
});

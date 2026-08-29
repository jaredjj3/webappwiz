import { beforeEach, describe, expect, it } from "bun:test";
import { defineRules, type RuleSet } from "@webappwiz/rules";
import { ruleDoc, testRule } from "@webappwiz/rules/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeGlob } from "webappwiz/system";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { Duration } from "webappwiz/time";
import { FakeClock } from "webappwiz/time/testing";
import { JudgeCommands } from "./judge";

describe("JudgeCommands", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));
	// No terminal, so every test here takes the line-by-line path unless it
	// hands in a screen of its own.
	const commands = (config: RuleSet) =>
		new JudgeCommands(config, {
			log,
			fs,
			ps,
			clock,
			glob: new NodeGlob(),
			screen: { tty: false, width: 80, write: () => {} },
		});
	const one = (document = ruleDoc("One")) => testRule("one", { document });
	const oneRule = defineRules({ rules: [one()] });
	const judging = { dir: "/p", agent: "haiku", chunk: 25 };

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		await fs.mkdir("/p");
	});

	it("shows each rule as a table row when listing", () => {
		commands(oneRule).ls();

		expect(printed()).toContain("id    rule   set     level   files");
		expect(printed()).toContain("one   One    judge   error");
	});

	it("lists the rules only a reader applies beside the ones a run checks", () => {
		new JudgeCommands(oneRule, {
			signoffRules: [{ id: "two", document: ruleDoc("Two") }],
			log,
			fs,
			ps,
			clock,
			glob: new NodeGlob(),
		}).ls();

		expect(printed()).toContain("one   One    judge");
		expect(printed()).toContain("two   Two    signoff");
	});

	it("prints one rule in full when shown its id", () => {
		commands(oneRule).show({ id: "one" });

		expect(printed()).toContain("id      one");
		expect(printed()).toContain("level   error");
		expect(printed()).toContain("# One"); // the document itself, verbatim
		expect(printed()).toContain("## Bad");
	});

	it("lists the ids it does know when shown one it does not", () => {
		expect(() => commands(oneRule).show({ id: "two" })).toThrow(
			'no rule "two". Known ids: one',
		);
	});

	it("prints what the agent found as a report of its own", async () => {
		await fs.write("/p/a.ts", "class A {}\nclass B {}");
		ps.setCaptureOutput(
			'[{"rule": "one", "file": "a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		expect(commands(oneRule).judge(judging)).rejects.toThrow("1 error");
		expect(printed()).toContain("✗ [1/1] (1 rule, 1 file): 1 problem");
		expect(printed()).toContain(
			"/p/a.ts:2  error  the file declares a second class (one)",
		);
		expect(printed()).toContain("│ class B {}");
	});

	it("tracks what each worker has read as reviews finish", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput(
			JSON.stringify({
				type: "result",
				usage: { input_tokens: 48_000, output_tokens: 100 },
				result: "[]",
			}),
			"",
		);

		await commands(oneRule).judge(judging);

		expect(printed()).toContain("clean in 0ms  48K tokens (w1: 48K)");
		expect(printed()).toContain("no violations in 0ms  48K tokens total");
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
		const config = defineRules({
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
			"agent     claude -p --output-format json --model haiku",
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

	it("prints the prompts and spawns nothing under --print", async () => {
		await fs.write("/p/a.ts", "class A {}");

		await commands(oneRule).judge({
			...judging,
			agent: undefined,
			print: true,
		});

		expect(printed()).toContain("--- one (1 file) ---");
		expect(printed()).toContain("exactly 1 rule");
		expect(printed()).toContain("- a.ts");
		expect(ps.getCalls()).toEqual([]);
	});

	it("leaves fully checked rules to the linter, judging the rest", async () => {
		await fs.write("/p/a.ts", "class A {}");
		const config = defineRules({
			rules: [
				testRule("one", {
					document: ruleDoc("One"),
					check: () => ({ findings: [] }),
				}),
				testRule("two", {
					document: ruleDoc("Two"),
					check: () => ({ findings: [], escalate: true }),
				}),
				testRule("three", { document: ruleDoc("Three") }),
			],
		});

		await commands(config).judge({
			...judging,
			agent: undefined,
			print: true,
		});

		// a partial check's rule still needs the agent; a full check's does not,
		// and the two survivors share their glob's one review
		expect(printed()).toContain("--- two, three (1 file) ---");
		expect(printed()).not.toContain("Rule `one`");
	});

	it("says what the run will read before it reads any of it", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge(judging);

		expect(printed()).toMatch(/reading {3}\d[\d.]*K?\+ tokens/);
	});

	it("lets --concurrency-override beat the config's concurrency", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge({ ...judging, "concurrency-override": 2 });

		expect(printed()).toContain("calls     1, 2 at a time");
	});

	it("prints the plan as lines rather than as one logged array", async () => {
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await commands(oneRule).judge(judging);

		expect(printed()).toContain(
			["  files     1", "  rules     1", "  calls     1"].join("\n"),
		);
	});

	it("draws a live worker block on a terminal, then dumps the report", async () => {
		const writes: string[] = [];
		const live = new JudgeCommands(oneRule, {
			log,
			fs,
			ps,
			clock,
			glob: new NodeGlob(),
			screen: { tty: true, width: 100, write: (text) => writes.push(text) },
		});
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await live.judge(judging);

		const block = color.strip(writes.join(""));
		expect(block).toContain("w1  one (1 file, ~"); // the review in flight
		expect(block).toContain("idle  1 call"); // and the worker run dry
		expect(printed()).toContain("✓ [1/1]"); // the report still lands, after
	});

	it("stays line-by-line under --ci, drawing nothing", async () => {
		const writes: string[] = [];
		const live = new JudgeCommands(oneRule, {
			log,
			fs,
			ps,
			clock,
			glob: new NodeGlob(),
			screen: { tty: true, width: 100, write: (text) => writes.push(text) },
		});
		await fs.write("/p/a.ts", "class A {}");
		ps.setCaptureOutput("[]", "");

		await live.judge({ ...judging, ci: true });

		expect(writes).toEqual([]);
		expect(printed()).toContain("✓ [1/1]");
	});

	it("checks only what changed when --since names a ref", async () => {
		await fs.write("/p/a.ts", "class A {}");
		await fs.write("/p/b.ts", "class B {}");
		ps.setCaptureOutput("a.ts\n", "");

		await commands(oneRule).judge({
			...judging,
			agent: undefined,
			since: "main",
			print: true,
		});

		expect(printed()).toContain("--- one (1 file) ---");
		expect(printed()).toContain("- a.ts");
		expect(printed()).not.toContain("- b.ts");
	});

	it("refuses a flag that prints together with one that runs", async () => {
		await expect(
			commands(oneRule).judge({ ...judging, print: true }),
		).rejects.toThrow("--print and --agent are different things");
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

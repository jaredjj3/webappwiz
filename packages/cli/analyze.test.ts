import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { compile, type Rule } from "@webappwiz/style";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { Analyzer } from "./analyze";
import { ruleDoc } from "./testing";

const compiled = (name: string, files = "**/*.ts"): Rule => {
	const out = compile(ruleDoc(name, files), `${name}.md`);
	if (!out.rule) {
		throw new Error("fixture rule failed to compile");
	}
	return out.rule;
};

describe("Analyzer", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;
	let analyzer: Analyzer;

	const errors = () =>
		log.entries
			.filter((e) => e.level === "error")
			.map((e) => String(e.message));

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		analyzer = new Analyzer(log, fs, ps, clock);
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "class A {}");
		await fs.write("/p/src/b.ts", "class B {}");
		await fs.write("/p/README.md", "# hi");
	});

	it("matches each rule's glob against dir-relative paths", async () => {
		const tasks = await analyzer.plan(
			[compiled("Classes"), compiled("Docs", "**/*.md")],
			"/p",
			25,
		);

		expect(tasks.map((t) => [t.rule.name, t.files])).toEqual([
			["Classes", ["src/a.ts", "src/b.ts"]],
			["Docs", ["README.md"]],
		]);
	});

	it("chunks a rule's files into several tasks", async () => {
		const tasks = await analyzer.plan([compiled("Classes")], "/p", 1);

		expect(tasks.map((t) => t.files)).toEqual([["src/a.ts"], ["src/b.ts"]]);
	});

	it("warns on stderr when a rule matches nothing", async () => {
		await analyzer.plan([compiled("Python", "**/*.py")], "/p", 25);

		expect(errors()[0]).toBe('rule "Python" matches no files under /p');
	});

	it("gives each task a prompt holding the whole rule and only its files", async () => {
		const [task] = await analyzer.plan([compiled("Classes")], "/p", 1);

		expect(task?.prompt).toContain("exactly one style rule");
		expect(task?.prompt).toContain("# Classes"); // the rule md, verbatim
		expect(task?.prompt).toContain("## Good");
		expect(task?.prompt).toContain("- src/a.ts");
		expect(task?.prompt).not.toContain("b.ts");
		expect(task?.prompt).toContain('"line"');
		expect(task?.prompt).toContain("style-ignore Classes: <reason>");
	});

	it("passes the prompt to the agent command as its last argument", async () => {
		ps.setCaptureOutput("[]", "");

		await analyzer.analyze([compiled("Classes")], "/p", 25, "claude -p");

		const call = ps.getCalls()[0] ?? "";
		expect(call.startsWith("claude -p ")).toBe(true);
		expect(call).toContain("# Classes");
	});

	it("labels what the agent reports with the id of the rule that found it", async () => {
		ps.setCaptureOutput(
			'[{"file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations).toEqual([
			{
				id: "Classes", // the fixture's rule file is Classes.md
				level: "error",
				file: "/p/src/a.ts",
				line: 1,
				message: "the file declares a second class",
				code: "class A {}",
			},
		]);
	});

	it("drops a finding the code excuses with a style-ignore comment", async () => {
		await fs.write(
			"/p/src/a.ts",
			"// style-ignore Classes: the second class is a fixture\nclass A {}\nclass B {}\n",
		);
		ps.setCaptureOutput(
			'[{"file": "src/a.ts", "line": 2, "message": "the file declares a second class"},' +
				'{"file": "src/a.ts", "line": 3, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations.map((v) => v.line)).toEqual([3]);
	});

	it("quotes the line from disk, not from the agent", async () => {
		await fs.write("/p/src/a.ts", "class A {}\n\tclass B {}\n");
		ps.setCaptureOutput(
			'[{"file": "src/a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		const [found] = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(found?.code).toBe("class B {}");
	});

	it("leaves the quote empty when the agent names a line that is not there", async () => {
		ps.setCaptureOutput(
			'[{"file": "src/gone.ts", "line": 400, "message": "rename it"}]',
			"",
		);

		const [found] = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(found?.code).toBe("");
	});

	it("hands each task's findings over as its agent returns", async () => {
		ps.setCaptureOutput(
			'[{"file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const finished: string[] = [];
		await analyzer.analyze([compiled("Classes")], "/p", 1, "agent", (task) =>
			finished.push(`${task.id} ${task.done}/${task.total}`),
		);

		expect(finished).toEqual(["Classes 1/2", "Classes 2/2"]);
	});

	it("times each task from the moment its agent starts", async () => {
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(3));
			return 0;
		});

		const took: string[] = [];
		await analyzer.analyze([compiled("Classes")], "/p", 25, "agent", (task) =>
			took.push(task.took.human()),
		);

		expect(took).toEqual(["3.0s"]);
	});

	it("finds the array when the agent wraps it in prose", async () => {
		ps.setCaptureOutput(
			'Sure! Here you go:\n```json\n[{"file": "src/a.ts", "line": 1, "message": "nope"}]\n```\n',
			"",
		);

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations.map((v) => v.message)).toEqual(["nope"]);
	});

	it("drops elements the agent malformed", async () => {
		ps.setCaptureOutput('[{"file": "src/a.ts"}, "nonsense"]', "");

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations).toEqual([]);
	});

	it("reports on stderr when the agent answers with no array at all", async () => {
		ps.setCaptureOutput("I could not read the files.", "");

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations).toEqual([]);
		expect(errors()[0]).toContain('no JSON array on rule "Classes"');
	});

	it("reports on stderr when the agent command fails", async () => {
		ps.exit(127);
		ps.setCaptureOutput("", "command not found: claude");

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"claude",
		);

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe(
			'agent exited 127 on rule "Classes": command not found: claude',
		);
	});

	it("orders one task's violations by file and line", async () => {
		ps.setCaptureOutput(
			'[{"file": "src/b.ts", "line": 1, "message": "later"}, {"file": "src/a.ts", "line": 1, "message": "earlier"}]',
			"",
		);

		const violations = await analyzer.analyze(
			[compiled("Classes")],
			"/p",
			25,
			"agent",
		);

		expect(violations.map((v) => v.message)).toEqual(["earlier", "later"]);
	});
});

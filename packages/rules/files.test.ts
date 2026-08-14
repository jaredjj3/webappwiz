import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/sys";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { FakeClock } from "@webappwiz/time/testing";
import { Analyzer } from "./analyze";
import { testRule } from "./testing";

const agent = { argv: ["agent"], label: "agent" };

const rule = (name: string, files = "**/*.ts") => testRule(name, { files });

describe("Analyzer", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let analyzer: Analyzer;

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		analyzer = new Analyzer(log, fs, ps, new FakeClock(), new NodeGlob());
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "class A {}");
		await fs.write("/p/src/b.ts", "class B {}");
		await fs.write("/p/README.md", "# hi");
	});

	it("matches each rule's glob against dir-relative paths", async () => {
		const tasks = await analyzer.plan(
			[rule("Classes"), rule("Docs", "**/*.md")],
			"/p",
			{ chunk: 25 },
		);

		expect(tasks.map((task) => [task.label, task.files])).toEqual([
			["Classes", ["src/a.ts", "src/b.ts"]],
			["Docs", ["README.md"]],
		]);
	});

	it("rides every rule sharing a glob in one task, reading the files once", async () => {
		const tasks = await analyzer.plan(
			[rule("Classes"), rule("Callbacks"), rule("Docs", "**/*.md")],
			"/p",
			{ chunk: 25 },
		);

		expect(
			tasks.map((task) => [task.rules.map((rule) => rule.id), task.files]),
		).toEqual([
			[
				["Classes", "Callbacks"],
				["src/a.ts", "src/b.ts"],
			],
			[["Docs"], ["README.md"]],
		]);
	});

	it("chunks a rule's files into several tasks", async () => {
		const tasks = await analyzer.plan([rule("Classes")], "/p", { chunk: 1 });

		expect(tasks.map((task) => task.files)).toEqual([
			["src/a.ts"],
			["src/b.ts"],
		]);
	});

	it("warns on stderr when a rule matches nothing", async () => {
		await analyzer.plan([rule("Python", "**/*.py")], "/p", { chunk: 25 });

		expect(errors()[0]).toBe('rule "Python" matches no files under /p');
	});

	it("gives each task a prompt holding the whole rule and only its files", async () => {
		const [task] = await analyzer.plan([rule("Classes")], "/p", { chunk: 1 });
		const prompt = task ? analyzer.prompt(task) : "";

		expect(prompt).toContain("Rule `Classes`, verbatim:");
		expect(prompt).toContain("# Classes"); // the rule md, verbatim
		expect(prompt).toContain("## Good");
		expect(prompt).toContain("- src/a.ts");
		expect(prompt).not.toContain("b.ts");
		expect(prompt).toContain("judge-ignore <id>: <reason>");
	});

	it("prices a task by its prompt and the files it names", async () => {
		const [task] = await analyzer.plan([rule("Classes")], "/p", { chunk: 1 });

		expect(task?.bytes).toBeGreaterThan(
			Buffer.byteLength(task ? analyzer.prompt(task) : ""),
		);
	});

	it("labels what the agent reports with the rule it says was broken", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await analyzer.analyze(
			[rule("Classes"), rule("Callbacks")],
			"/p",
			agent,
		);

		expect(violations).toEqual([
			{
				id: "Classes",
				level: "error",
				file: "/p/src/a.ts",
				line: 1,
				message: "the file declares a second class",
				code: "class A {}",
			},
		]);
	});

	it("drops a finding the code excuses with a judge-ignore comment", async () => {
		await fs.write(
			"/p/src/a.ts",
			"// judge-ignore Classes: the second class is a fixture\nclass A {}\nclass B {}\n",
		);
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 2, "message": "the file declares a second class"},' +
				'{"rule": "Classes", "file": "src/a.ts", "line": 3, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations.map((violation) => violation.line)).toEqual([3]);
	});

	it("quotes the line from disk, not from the agent", async () => {
		await fs.write("/p/src/a.ts", "class A {}\n\tclass B {}\n");
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		const [found] = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(found?.code).toBe("class B {}");
	});

	it("leaves the quote empty when the agent names a line that is not there", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/gone.ts", "line": 400, "message": "rename it"}]',
			"",
		);

		const [found] = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(found?.code).toBe("");
	});

	it("drops a finding the agent gave nowhere to point at", async () => {
		ps.setCaptureOutput('[{"rule": "Classes", "message": "somewhere"}]', "");

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe('agent located no file for "Classes" on Classes');
	});

	it("hands each task's violations over as its agent returns", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);
		const handed: string[] = [];
		analyzer.events.on("finished", (task) =>
			handed.push(
				`${task.label} [${task.rules.join(",")}] ${task.done}/${task.total}`,
			),
		);

		await analyzer.analyze([rule("Classes")], "/p", agent, { chunk: 1 });

		expect(handed).toEqual(["Classes [Classes] 1/2", "Classes [Classes] 2/2"]);
	});

	it("passes the price the agent reported through to its own event", async () => {
		const billed: Array<number | undefined> = [];
		ps.setCaptureOutput(
			JSON.stringify({ total_cost_usd: 0.056097, result: "[]" }),
			"",
		);
		analyzer.events.on("finished", (task) => billed.push(task.cost));

		await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(billed).toEqual([0.056097]);
	});

	it("orders one task's violations by file and line", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/b.ts", "line": 1, "message": "later"}, {"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "earlier"}]',
			"",
		);

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations.map((violation) => violation.message)).toEqual([
			"earlier",
			"later",
		]);
	});
});

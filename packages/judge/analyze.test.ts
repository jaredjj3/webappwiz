import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/sys";
import { FakeFs, FakePs } from "@webappwiz/sys/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { Analyzer } from "./analyze";
import { testRule } from "./testing";

const agent = { argv: ["agent"], label: "agent" };

const rule = (name: string, files = "**/*.ts") => testRule(name, { files });

describe("Analyzer", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;
	let analyzer: Analyzer;

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		analyzer = new Analyzer(log, fs, ps, clock, new NodeGlob());
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

		expect(tasks.map((task) => [task.glob, task.files])).toEqual([
			["**/*.ts", ["src/a.ts", "src/b.ts"]],
			["**/*.md", ["README.md"]],
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
		expect(tasks[0]?.prompt).toContain("# Classes");
		expect(tasks[0]?.prompt).toContain("# Callbacks");
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

		expect(task?.prompt).toContain("exactly 1 style rule");
		expect(task?.prompt).toContain("Rule `Classes`, verbatim:");
		expect(task?.prompt).toContain("# Classes"); // the rule md, verbatim
		expect(task?.prompt).toContain("## Good");
		expect(task?.prompt).toContain("- src/a.ts");
		expect(task?.prompt).not.toContain("b.ts");
		expect(task?.prompt).toContain('"line"');
		expect(task?.prompt).toContain("judge-ignore <id>: <reason>");
	});

	it("keeps no more agents in flight at once than it was allowed", async () => {
		ps.setCaptureOutput("[]", "");
		let running = 0;
		let peak = 0;
		ps.simulate(async () => {
			running++;
			peak = Math.max(peak, running);
			await Promise.resolve();
			running--;
			return 0;
		});
		const tasks = await analyzer.plan(
			[rule("Classes"), rule("Docs", "**/*.md")],
			"/p",
			{ chunk: 1 },
		);

		await analyzer.run(tasks, "/p", agent, 2);

		expect(tasks).toHaveLength(3); // more tasks than slots, or this proves nothing
		expect(peak).toBe(2);
		expect(ps.getCalls()).toHaveLength(3);
	});

	it("passes the prompt to the agent command as its last argument", async () => {
		ps.setCaptureOutput("[]", "");

		await analyzer.analyze([rule("Classes")], "/p", {
			argv: ["claude", "-p"],
			label: "claude -p",
		});

		const call = ps.getCalls()[0] ?? "";
		expect(call.startsWith("claude -p ")).toBe(true);
		expect(call).toContain("# Classes");
	});

	it("reads the findings and the price out of the agent's envelope", async () => {
		const finished: Array<number | undefined> = [];
		ps.setCaptureOutput(
			JSON.stringify({
				type: "result",
				total_cost_usd: 0.056097,
				result:
					'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			}),
			"",
		);

		analyzer.events.on("finished", (task) => finished.push(task.cost));

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations.map((violation) => violation.id)).toEqual(["Classes"]);
		expect(finished).toEqual([0.056097]);
	});

	it("finds the array inside the prose an envelope wraps it in", async () => {
		ps.setCaptureOutput(
			JSON.stringify({
				total_cost_usd: 0.01,
				result:
					'Here is what I found:\n```json\n[{"rule": "Classes", "file": "src/a.ts", "line": 2, "message": "a second class"}]\n```',
			}),
			"",
		);

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations.map((violation) => violation.line)).toEqual([2]);
	});

	it("reports no price for an agent that answers with the bare array", async () => {
		const finished: Array<number | undefined> = [];
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "a second class"}]',
			"",
		);

		analyzer.events.on("finished", (task) => finished.push(task.cost));

		await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(finished).toEqual([undefined]);
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

	it("hands each task's findings over as its agent returns", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const finished: string[] = [];
		analyzer.events.on("finished", (task) =>
			finished.push(
				`${task.glob} [${task.rules.join(",")}] ${task.done}/${task.total}`,
			),
		);

		await analyzer.analyze([rule("Classes")], "/p", agent, { chunk: 1 });

		expect(finished).toEqual([
			"**/*.ts [Classes] 1/2",
			"**/*.ts [Classes] 2/2",
		]);
	});

	it("drops a finding filed under a rule the task was not checking", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Docs", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe('agent reported unknown rule "Docs" on **/*.ts');
	});

	it("times each task from the moment its agent starts", async () => {
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(3));
			return 0;
		});

		const took: string[] = [];
		analyzer.events.on("finished", (task) => took.push(task.took.human()));

		await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(took).toEqual(["3.0s"]);
	});

	it("finds the array when the agent wraps it in prose", async () => {
		ps.setCaptureOutput(
			'Sure! Here you go:\n```json\n[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "nope"}]\n```\n',
			"",
		);

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations.map((violation) => violation.message)).toEqual(["nope"]);
	});

	it("drops elements the agent malformed", async () => {
		ps.setCaptureOutput('[{"file": "src/a.ts"}, "nonsense"]', "");

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations).toEqual([]);
	});

	it("reports on stderr when the agent answers with no array at all", async () => {
		ps.setCaptureOutput("I could not read the files.", "");

		const violations = await analyzer.analyze([rule("Classes")], "/p", agent);

		expect(violations).toEqual([]);
		expect(errors()[0]).toContain("no JSON array on **/*.ts");
	});

	it("reports on stderr when the agent command fails", async () => {
		ps.exit(127);
		ps.setCaptureOutput("", "command not found: claude");

		const violations = await analyzer.analyze([rule("Classes")], "/p", {
			argv: ["claude"],
			label: "claude",
		});

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe(
			"agent exited 127 on **/*.ts: command not found: claude",
		);
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

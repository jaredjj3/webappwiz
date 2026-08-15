import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { NodeGlob } from "@webappwiz/system";
import { FakeFs, FakePs } from "@webappwiz/system/testing";
import { FakeClock } from "@webappwiz/time/testing";
import { Files, type PlanOptions, type Violation } from "./files";
import { Harness } from "./harness";
import { prompt } from "./prompt";
import type { FileRule } from "./rule";
import { testRule } from "./testing";

const agent = { argv: ["agent"], label: "agent" };

const rule = (name: string, files = "**/*.ts") => testRule(name, { files });

describe("Files", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;
	let files: Files;

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	/** Plan, run, and turn the findings back, which is what a command does with
	 * these two and the only way either is used. */
	const judge = async (
		rules: FileRule[],
		dir: string,
		opts: PlanOptions = {},
	): Promise<Violation[]> => {
		const tasks = await files.plan(rules, dir, opts);
		const harness = new Harness({ log, ps, clock: new FakeClock() });
		const found: Violation[][] = [];
		harness.events.on("finished", ({ at, findings }) => {
			const task = tasks[at];
			if (task) {
				found[at] = files.violations(task, findings, dir);
			}
		});
		await harness.run(tasks, agent, { cwd: dir });
		return found.flat();
	};

	beforeEach(async () => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
		files = new Files({ log: log, fs: fs, glob: new NodeGlob() });
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "class A {}");
		await fs.write("/p/src/b.ts", "class B {}");
		await fs.write("/p/README.md", "# hi");
	});

	it("matches each rule's glob against dir-relative paths", async () => {
		const tasks = await files.plan(
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
		const tasks = await files.plan(
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
		const tasks = await files.plan([rule("Classes")], "/p", { chunk: 1 });

		expect(tasks.map((task) => task.files)).toEqual([
			["src/a.ts"],
			["src/b.ts"],
		]);
	});

	it("warns on stderr when a rule matches nothing", async () => {
		await files.plan([rule("Python", "**/*.py")], "/p", { chunk: 25 });

		expect(errors()[0]).toBe('rule "Python" matches no files under /p');
	});

	it("gives each task a prompt holding the whole rule and only its files", async () => {
		const [task] = await files.plan([rule("Classes")], "/p", { chunk: 1 });
		const built = task ? prompt(task) : "";

		expect(built).toContain("Rule `Classes`, verbatim:");
		expect(built).toContain("# Classes"); // the rule md, verbatim
		expect(built).toContain("## Good");
		expect(built).toContain("- src/a.ts");
		expect(built).not.toContain("b.ts");
		expect(built).toContain("judge-ignore <id>: <reason>");
	});

	it("prices a task by its prompt and the files it names", async () => {
		const [task] = await files.plan([rule("Classes")], "/p", { chunk: 1 });

		expect(task?.bytes).toBeGreaterThan(
			Buffer.byteLength(task ? prompt(task) : ""),
		);
	});

	it("labels what the agent reports with the rule it says was broken", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "the file declares a second class"}]',
			"",
		);

		const violations = await judge([rule("Classes"), rule("Callbacks")], "/p");

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

		const violations = await judge([rule("Classes")], "/p");

		expect(violations.map((violation) => violation.line)).toEqual([3]);
	});

	it("quotes the line from disk, not from the agent", async () => {
		await fs.write("/p/src/a.ts", "class A {}\n\tclass B {}\n");
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 2, "message": "the file declares a second class"}]',
			"",
		);

		const [found] = await judge([rule("Classes")], "/p");

		expect(found?.code).toBe("class B {}");
	});

	it("leaves the quote empty when the agent names a line that is not there", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/a.ts", "line": 400, "message": "rename it"}]',
			"",
		);

		const [found] = await judge([rule("Classes")], "/p");

		expect(found?.code).toBe("");
	});

	it("drops a finding in a file the task was never given", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/gone.ts", "line": 1, "message": "rename it"}]',
			"",
		);

		const violations = await judge([rule("Classes")], "/p");

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe(
			'agent reported "Classes" in src/gone.ts, which Classes was not given',
		);
	});

	it("drops a finding the agent gave nowhere to point at", async () => {
		ps.setCaptureOutput('[{"rule": "Classes", "message": "somewhere"}]', "");

		const violations = await judge([rule("Classes")], "/p");

		expect(violations).toEqual([]);
		expect(errors()[0]).toBe('agent located no file for "Classes" on Classes');
	});

	it("orders one task's violations by file and line", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "file": "src/b.ts", "line": 1, "message": "later"}, {"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "earlier"}]',
			"",
		);

		const violations = await judge([rule("Classes")], "/p");

		expect(violations.map((violation) => violation.message)).toEqual([
			"earlier",
			"later",
		]);
	});
});

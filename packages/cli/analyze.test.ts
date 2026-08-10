import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { compile, type Rule } from "@webappwiz/style";
import { FakeFs } from "@webappwiz/sys/testing";
import { Planner } from "./analyze";
import { ruleDoc } from "./testing";

const compiled = (name: string, files = "**/*.ts"): Rule => {
	const out = compile(ruleDoc(name, files), `${name}.md`);
	if (!out.rule) {
		throw new Error("fixture rule failed to compile");
	}
	return out.rule;
};

describe("Planner", () => {
	let fs: FakeFs;
	let log: MemoryLogger;
	let planner: Planner;

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		planner = new Planner(log, fs);
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "class A {}");
		await fs.write("/p/src/b.ts", "class B {}");
		await fs.write("/p/README.md", "# hi");
	});

	it("matches each rule's glob against dir-relative paths", async () => {
		const tasks = await planner.plan(
			[compiled("Classes"), compiled("Docs", "**/*.md")],
			"/p",
			25,
		);

		expect(tasks.map((t) => [t.rule, t.files])).toEqual([
			["Classes", ["src/a.ts", "src/b.ts"]],
			["Docs", ["README.md"]],
		]);
	});

	it("chunks a rule's files into several tasks", async () => {
		const tasks = await planner.plan([compiled("Classes")], "/p", 1);

		expect(tasks.map((t) => t.files)).toEqual([["src/a.ts"], ["src/b.ts"]]);
	});

	it("warns on stderr when a rule matches nothing", async () => {
		await planner.plan([compiled("Python", "**/*.py")], "/p", 25);

		const errors = log.entries.filter((e) => e.level === "error");
		expect(String(errors[0]?.message)).toBe(
			'rule "Python" matches no files under /p',
		);
	});

	it("gives each task a prompt holding the whole rule and only its files", async () => {
		const [task] = await planner.plan([compiled("Classes")], "/p", 1);

		expect(task?.prompt).toContain("exactly one style rule");
		expect(task?.prompt).toContain("# Classes"); // the rule md, verbatim
		expect(task?.prompt).toContain("## Good");
		expect(task?.prompt).toContain("- src/a.ts");
		expect(task?.prompt).not.toContain("b.ts");
		expect(task?.prompt).toContain('"rule": "Classes"');
	});

	it("numbers the tasks and says how to run them when rendering", async () => {
		const tasks = await planner.plan([compiled("Classes")], "/p", 25);

		const out = planner.render(tasks, 1);

		expect(out).toContain("# Style analysis plan: 1 rule, 2 files, 1 task");
		expect(out).toContain("spawn one subagent per task");
		expect(out).toContain("perform each task yourself");
		expect(out).toContain("## Task 1 of 1: Classes");
	});

	it("fences each rendered prompt past the fences the prompt holds", async () => {
		const tasks = await planner.plan([compiled("Classes")], "/p", 25);

		// rule md holds ``` fences, the prompt wraps them in ````, the plan in `````
		expect(planner.render(tasks, 1)).toContain("\n`````\n");
	});
});

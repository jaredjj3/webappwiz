import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { compile, defineStyleGuide, type Rule, rule } from "@webappwiz/style";
import { FakeFs } from "@webappwiz/sys/testing";
import { analyze, plan, render } from "./analyze";
import { ruleDoc } from "./testing";

const compiled = (name: string, files = "**/*.ts"): Rule => {
	const out = compile(ruleDoc(name, files), `${name}.md`);
	if (!out.rule) {
		throw new Error("fixture rule failed to compile");
	}
	return out.rule;
};

describe("plan", () => {
	let fs: FakeFs;

	beforeEach(async () => {
		fs = new FakeFs();
		await fs.mkdir("/p/src");
		await fs.write("/p/src/a.ts", "class A {}");
		await fs.write("/p/src/b.ts", "class B {}");
		await fs.write("/p/README.md", "# hi");
	});

	it("matches each rule's glob against dir-relative paths", async () => {
		const tasks = await plan(
			[compiled("Classes"), compiled("Docs", "**/*.md")],
			"/p",
			25,
			fs,
		);

		expect(tasks.map((t) => [t.rule, t.files])).toEqual([
			["Classes", ["src/a.ts", "src/b.ts"]],
			["Docs", ["README.md"]],
		]);
	});

	it("chunks a rule's files into several tasks", async () => {
		const tasks = await plan([compiled("Classes")], "/p", 1, fs);

		expect(tasks.map((t) => t.files)).toEqual([["src/a.ts"], ["src/b.ts"]]);
	});

	it("gives each task a prompt holding the whole rule and only its files", async () => {
		const [task] = await plan([compiled("Classes")], "/p", 1, fs);

		expect(task?.prompt).toContain("exactly one style rule");
		expect(task?.prompt).toContain("# Classes"); // the rule md, verbatim
		expect(task?.prompt).toContain("## Good");
		expect(task?.prompt).toContain("- src/a.ts");
		expect(task?.prompt).not.toContain("b.ts");
		expect(task?.prompt).toContain('"rule": "Classes"');
	});
});

describe("render", () => {
	it("numbers the tasks and says how to run them", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/p");
		await fs.write("/p/a.ts", "x");
		const tasks = await plan([compiled("Classes")], "/p", 25, fs);

		const out = render(tasks, 1, "/p");

		expect(out).toContain("# Style analysis plan: 1 rule, 1 file, 1 task");
		expect(out).toContain("spawn one subagent per task");
		expect(out).toContain("perform each task yourself");
		expect(out).toContain("## Task 1 of 1: Classes");
	});

	it("fences each prompt past the fences the prompt holds", async () => {
		const fs = new FakeFs();
		await fs.mkdir("/p");
		await fs.write("/p/a.ts", "x");
		const tasks = await plan([compiled("Classes")], "/p", 25, fs);

		// rule md holds ``` fences, the prompt wraps them in ````, the plan in `````
		expect(render(tasks, 1, "/p")).toContain("\n`````\n");
	});
});

describe("analyze", () => {
	let fs: FakeFs;
	let log: MemoryLogger;

	const load = async () => ({
		guide: defineStyleGuide([rule("./one.md")]),
		dir: "/g",
	});

	beforeEach(async () => {
		fs = new FakeFs();
		log = new MemoryLogger();
		await fs.mkdir("/g");
		await fs.mkdir("/p");
		await fs.write("/p/a.ts", "class A {}");
	});

	it("prints the plan for a sound guide", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await analyze(
			{ rules: "guide.ts", dir: "/p", json: false, chunk: 25 },
			log,
			fs,
			load,
		);

		const infos = log.entries.filter((e) => e.level === "info");
		expect(String(infos[0]?.message)).toContain("## Task 1 of 1: One");
	});

	it("prints a machine plan under --json", async () => {
		await fs.write("/g/one.md", ruleDoc("One"));

		await analyze(
			{ rules: "guide.ts", dir: "/p", json: true, chunk: 25 },
			log,
			fs,
			load,
		);

		const out = JSON.parse(String(log.entries[0]?.message));
		expect(out.rules).toEqual(["One"]);
		expect(out.tasks[0].files).toEqual(["a.ts"]);
	});

	it("refuses an unsound guide, pointing at style check", async () => {
		await fs.write("/g/one.md", "just prose\n");

		expect(
			analyze(
				{ rules: "guide.ts", dir: "/p", json: false, chunk: 25 },
				log,
				fs,
				load,
			),
		).rejects.toThrow("3 errors");
	});

	it("warns on stderr when a rule matches nothing", async () => {
		await fs.write("/g/one.md", ruleDoc("One", "**/*.py"));

		await analyze(
			{ rules: "guide.ts", dir: "/p", json: false, chunk: 25 },
			log,
			fs,
			load,
		);

		const errors = log.entries.filter((e) => e.level === "error");
		expect(String(errors[0]?.message)).toBe(
			'rule "One" matches no files under /p',
		);
	});
});

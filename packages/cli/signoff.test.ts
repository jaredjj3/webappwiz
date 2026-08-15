import { beforeEach, describe, expect, it } from "bun:test";
import { color, MemoryLogger } from "@webappwiz/log";
import type { Rule } from "@webappwiz/rules";
import { ruleDoc } from "@webappwiz/rules/testing";
import { FakePs } from "@webappwiz/system/testing";
import { FakeClock } from "@webappwiz/time/testing";
import type { Confirm } from "./judge";
import { Signoff } from "./signoff";

describe("Signoff", () => {
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;

	const printed = () =>
		color.strip(log.entries.map((entry) => String(entry.message)).join("\n"));
	const rules: Rule[] = [
		{ id: "two", document: ruleDoc("Two") },
		{ id: "three", document: ruleDoc("Three") },
	];
	const signoff = (confirm?: Confirm) =>
		new Signoff(rules, "haiku", { log, ps, clock, confirmer: confirm });
	// budget high enough that only the test about budgets ever meets it
	const weighing = { dir: "/p", since: "main", budget: 1_000_000 };
	const patch = "diff --git a/a.ts b/a.ts\n+class A {}";
	// One answer per spawn, in order: the diff, the files git has never seen,
	// then the agent. The fake has one output at a time, so each call sets the
	// next one's before it returns.
	const answers = (...queued: string[]) => {
		let at = 0;
		ps.simulate(async () => {
			ps.setCaptureOutput(queued[at++] ?? "", "");
			return 0;
		});
	};

	beforeEach(() => {
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
	});

	it("prints every rule in full and spawns nothing under --print", async () => {
		await signoff().run({ ...weighing, print: true });

		expect(printed()).toContain("Weigh your change against each rule below");
		expect(printed()).toContain("# Two");
		expect(printed()).toContain("# Three");
		expect(ps.getCalls()).toEqual([]);
	});

	it("divides each rule from the next, and the last from what follows", async () => {
		await signoff().run({ ...weighing, print: true });

		expect(printed()).toContain("--- two ---");
		expect(printed()).toContain("--- three ---");
		expect(printed().trimEnd()).toEndWith("-----");
	});

	it("says there are none rather than printing nothing", async () => {
		await new Signoff([], "haiku", { log, ps, clock }).run({
			...weighing,
			print: true,
		});

		expect(printed()).toContain("no signoff rules");
	});

	it("refuses to print and run at once", async () => {
		await expect(
			signoff().run({ ...weighing, print: true, agent: "haiku" }),
		).rejects.toThrow("--print and --agent are different things");
	});

	it("asks git for the change, then weighs it in one call", async () => {
		answers(patch, "", "[]");

		await signoff().run(weighing);

		expect(ps.getCalls().slice(0, 2)).toEqual([
			"git -C /p diff --relative main",
			"git -C /p ls-files --others --exclude-standard",
		]);
		expect(ps.getCalls()[2]).toStartWith(
			"claude -p --output-format json --model haiku ",
		);
	});

	it("hands the agent the diff and the files no diff reaches", async () => {
		answers(patch, "b.ts\n", "[]");

		await signoff().run(weighing);

		const prompt = ps.getCalls()[2] ?? "";
		expect(prompt).toContain("+class A {}");
		expect(prompt).toContain("- b.ts");
		expect(prompt).toContain("Rule `two`");
	});

	it("clears a change no rule stops", async () => {
		answers(patch, "", "[]");

		await signoff().run(weighing);

		expect(printed()).toContain("nothing in this change needs a person");
	});

	it("gives a reason to escalate for each rule that wants a person", async () => {
		answers(
			patch,
			"",
			'[{"rule": "two", "message": "the new dialog has no test"}]',
		);

		expect(signoff().run(weighing)).rejects.toThrow(
			"1 reason to escalate rather than merge",
		);
		expect(printed()).toContain("the new dialog has no test (two)");
	});

	it("says so and stops when nothing has changed since the ref", async () => {
		answers("", "");

		await signoff().run(weighing);

		expect(printed()).toContain("nothing has changed since main");
		expect(ps.getCalls()).toHaveLength(2); // the two git calls, and no agent
	});

	it("spawns nothing when the change is over budget and nobody says go", async () => {
		answers(patch, "", "[]");

		expect(
			signoff({ confirm: () => false }).run({ ...weighing, budget: 10 }),
		).rejects.toThrow("over budget");
		expect(printed()).toContain("over the 10 budget");
	});
});

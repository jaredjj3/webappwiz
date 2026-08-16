import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/system/testing";
import { Duration } from "@webappwiz/time";
import { FakeClock } from "@webappwiz/time/testing";
import { Harness } from "./harness";
import { prompt } from "./prompt";
import type { Review } from "./review";
import { testRule } from "./testing";

const agent = { argv: ["agent"], label: "agent" };

const review = (label: string, ...ids: string[]): Review => ({
	rules: ids.map((id) => testRule(id)),
	context: `Judge this:\n\n${label}`,
	label,
});

describe("Harness", () => {
	let ps: FakePs;
	let log: MemoryLogger;
	let clock: FakeClock;
	let harness: Harness;

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	beforeEach(() => {
		ps = new FakePs();
		log = new MemoryLogger();
		clock = new FakeClock();
		harness = new Harness({ log: log, ps: ps, clock: clock });
	});

	it("builds a prompt from the rule documents, the context and the contract", () => {
		const built = prompt({
			...review("src/a.ts", "Classes"),
			instructions: "Honor rule-ignore markers.",
		});

		expect(built).toContain("exactly 1 rule");
		expect(built).toContain("Rule `Classes`, verbatim:");
		expect(built).toContain("# Classes"); // the rule md, verbatim
		expect(built).toContain("## Good");
		expect(built).toContain("Judge this:");
		expect(built).toContain("Honor rule-ignore markers.");
		expect(built).toContain('"rule"');
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

		await harness.run([review("a"), review("b"), review("c")], agent, {
			concurrency: 2,
		});

		expect(peak).toBe(2);
		expect(ps.getCalls()).toHaveLength(3);
	});

	it("passes the prompt to the agent command as its last argument", async () => {
		ps.setCaptureOutput("[]", "");

		await harness.run([review("a", "Classes")], {
			argv: ["claude", "-p"],
			label: "claude -p",
		});

		const call = ps.getCalls()[0] ?? "";
		expect(call.startsWith("claude -p ")).toBe(true);
		expect(call).toContain("# Classes");
	});

	it("reads the findings and the price out of the agent's envelope", async () => {
		const billed: Array<number | undefined> = [];
		ps.setCaptureOutput(
			JSON.stringify({
				type: "result",
				total_cost_usd: 0.056097,
				result:
					'[{"rule": "Classes", "file": "src/a.ts", "line": 1, "message": "a second class"}]',
			}),
			"",
		);
		harness.events.on("finished", (finished) => billed.push(finished.cost));

		const findings = await harness.run([review("a", "Classes")], agent);

		expect(findings).toEqual([
			{
				rule: "Classes",
				file: "src/a.ts",
				line: 1,
				message: "a second class",
			},
		]);
		expect(billed).toEqual([0.056097]);
	});

	it("finds the array inside the prose the agent wrapped it in", async () => {
		ps.setCaptureOutput(
			'Sure! Here you go:\n```json\n[{"rule": "Classes", "message": "a second class"}]\n```\n',
			"",
		);

		const findings = await harness.run([review("a", "Classes")], agent);

		expect(findings.map((finding) => finding.message)).toEqual([
			"a second class",
		]);
	});

	it("keeps a finding that names no file, for a rule about the whole change", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Scope", "message": "9 files changed, limit 5"}]',
			"",
		);

		const findings = await harness.run([review("changeset", "Scope")], agent);

		expect(findings).toEqual([
			{ rule: "Scope", message: "9 files changed, limit 5" },
		]);
	});

	it("reports no price for an agent that answers with the bare array", async () => {
		const billed: Array<number | undefined> = [];
		ps.setCaptureOutput(
			'[{"rule": "Classes", "message": "a second class"}]',
			"",
		);
		harness.events.on("finished", (finished) => billed.push(finished.cost));

		await harness.run([review("a", "Classes")], agent);

		expect(billed).toEqual([undefined]);
	});

	it("drops a finding filed under a rule the review was not checking", async () => {
		ps.setCaptureOutput('[{"rule": "Docs", "message": "a second class"}]', "");

		const findings = await harness.run([review("a", "Classes")], agent);

		expect(findings).toEqual([]);
		expect(errors()[0]).toBe('agent reported unknown rule "Docs" on a');
	});

	it("drops elements the agent malformed", async () => {
		ps.setCaptureOutput('[{"file": "src/a.ts"}, "nonsense"]', "");

		const findings = await harness.run([review("a", "Classes")], agent);

		expect(findings).toEqual([]);
	});

	it("hands each review's findings over as its agent returns", async () => {
		ps.setCaptureOutput(
			'[{"rule": "Classes", "message": "a second class"}]',
			"",
		);
		const handed: string[] = [];
		harness.events.on("finished", (finished) =>
			handed.push(
				`${finished.at} ${finished.label} [${finished.rules.join(",")}] ` +
					`${finished.done}/${finished.total}`,
			),
		);

		await harness.run([review("a", "Classes"), review("b", "Classes")], agent, {
			concurrency: 1,
		});

		expect(handed).toEqual(["0 a [Classes] 1/2", "1 b [Classes] 2/2"]);
	});

	it("times each review from the moment its agent starts", async () => {
		ps.setCaptureOutput("[]", "");
		ps.simulate(async () => {
			clock.advance(Duration.secs(3));
			return 0;
		});
		const took: string[] = [];
		harness.events.on("finished", (finished) =>
			took.push(finished.took.human()),
		);

		await harness.run([review("a", "Classes")], agent);

		expect(took).toEqual(["3.0s"]);
	});

	it("reports on stderr when the agent answers with no array at all", async () => {
		ps.setCaptureOutput("I could not read the files.", "");

		const findings = await harness.run([review("a", "Classes")], agent);

		expect(findings).toEqual([]);
		expect(errors()[0]).toContain("no JSON array on a");
	});

	it("reports on stderr when the agent command fails", async () => {
		ps.exit(127);
		ps.setCaptureOutput("", "command not found: claude");

		const findings = await harness.run([review("a", "Classes")], {
			argv: ["claude"],
			label: "claude",
		});

		expect(findings).toEqual([]);
		expect(errors()[0]).toBe(
			"agent exited 127 on a: command not found: claude",
		);
	});
});

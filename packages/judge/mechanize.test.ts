import { beforeEach, describe, expect, it } from "bun:test";
import { MemoryLogger } from "@webappwiz/log";
import { FakePs } from "@webappwiz/sys/testing";
import { Mechanizer } from "./mechanize";
import { testRule } from "./testing";

const agent = { argv: ["agent"], label: "agent" };

const rule = (name: string) => testRule(name);

describe("Mechanizer", () => {
	let ps: FakePs;
	let log: MemoryLogger;
	let mechanizer: Mechanizer;

	const errors = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	beforeEach(() => {
		ps = new FakePs();
		log = new MemoryLogger();
		mechanizer = new Mechanizer(log, ps);
	});

	it("warns about a rule the agent says a tool could enforce", async () => {
		ps.setCaptureOutput(
			'{"tool": "biome", "reason": "a regex for U+2014 outside code fences"}',
			"",
		);

		expect(await mechanizer.check([rule("Dashes")], agent)).toEqual([
			{
				rule: "Dashes",
				severity: "warning",
				message:
					"biome could enforce this without an agent: " +
					"a regex for U+2014 outside code fences",
			},
		]);
	});

	it("says nothing about a rule that needs an agent to read the code", async () => {
		ps.setCaptureOutput('{"tool": null}', "");

		expect(await mechanizer.check([rule("Comments")], agent)).toEqual([]);
	});

	it("asks about every rule in the config", async () => {
		ps.setCaptureOutput('{"tool": null}', "");

		await mechanizer.check([rule("Dashes"), rule("Comments")], agent);

		expect(ps.getCalls().length).toBe(2);
	});

	it("passes the prompt to the agent command as its last argument", async () => {
		ps.setCaptureOutput('{"tool": null}', "");

		await mechanizer.check([rule("Dashes")], {
			argv: ["claude", "-p"],
			label: "claude -p",
		});

		const call = ps.getCalls()[0] ?? "";
		expect(call.startsWith("claude -p ")).toBe(true);
		expect(call).toContain("# Dashes"); // the rule md, verbatim
	});

	it("reads an answer an agent wrapped in prose", async () => {
		ps.setCaptureOutput(
			'Here is my answer:\n```json\n{"tool": "grep", "reason": "a pattern"}\n```\n',
			"",
		);

		expect((await mechanizer.check([rule("Dashes")], agent)).length).toBe(1);
	});

	it("reports an agent that exits non-zero and warns about nothing", async () => {
		ps.setCaptureOutput("", "no api key");
		ps.exit(1);

		expect(await mechanizer.check([rule("Dashes")], agent)).toEqual([]);
		expect(errors()[0]).toBe('agent exited 1 on rule "Dashes": no api key');
	});

	it("reports an agent that answers with no JSON object at all", async () => {
		ps.setCaptureOutput("I could not decide", "");

		expect(await mechanizer.check([rule("Dashes")], agent)).toEqual([]);
		expect(errors()[0]).toBe(
			'agent returned no JSON object on rule "Dashes": I could not decide',
		);
	});

	it("tells the agent that an exception a tool would miss rules it out", async () => {
		const prompt = mechanizer.prompt(rule("Dashes"));

		expect(prompt).toContain("the exceptions the rule carves out");
		expect(prompt).toContain('{"tool": null}');
	});
});

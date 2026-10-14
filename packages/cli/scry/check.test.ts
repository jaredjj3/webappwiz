import {
	afterAll,
	afterEach,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
} from "bun:test";
import { FakeJudge } from "@webappwiz/scry/testing";
import { check } from "./check";
import { Testing } from "./testing";

describe("wiz scry", () => {
	let sandbox: Testing;

	beforeAll(async () => {
		sandbox = await Testing.seed();
	});

	afterAll(async () => {
		await sandbox.dispose();
	});

	beforeEach(async () => {
		await sandbox.begin();
	});

	afterEach(async () => {
		await sandbox.end();
	});

	it("prints the problems under their file, how sure the check is, and exits 1 on an error", async () => {
		await sandbox.run();

		expect(sandbox.printed()).toEqual(
			[
				"a.ts",
				"  1   error   100%   no foo   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file",
			].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([1]);
	});

	it("names each file still excusing itself with rule-ignore", async () => {
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// rule-ignore no-foo: old spelling\nconst foo = 1;\n",
		);

		await sandbox.run();

		expect(sandbox.warned()).toEqual([
			"1 file still uses rule-ignore, which scry honors for now: rename it to scry-ignore\n  a.ts",
		]);
	});

	it("prints the report as JSON when asked, confidence and all", async () => {
		await sandbox.run("json");

		expect(JSON.parse(sandbox.printed())).toMatchObject({
			problems: [
				{
					path: "a.ts",
					line: 1,
					rule: "no-foo",
					level: "error",
					confidence: 1,
				},
			],
			spent: { requests: 0, questions: 0, cached: 0 },
		});
	});

	it("asks no model, nor wants its credentials, when no rule asks the som", async () => {
		await sandbox.run();

		expect(sandbox.asked).toEqual([]);
	});

	it("asks the configured model what a rule's som asks, and drops what it thinks unlikely", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0.2);

		await sandbox.run();

		expect(sandbox.asked).toEqual(["clef"]);
		expect(sandbox.printed()).toEqual(
			["✔ no problems in 1 file", "  asked 1 question in 1 request"].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([]);
	});

	it("asks the model for the effort each question asks at, and the default's for one that names none", async () => {
		await sandbox.install(
			"why-not-what",
			`
			constructor(tools) { this.som = tools.som; }
			async check(file) {
				const [comment] = file.ts.comments();
				await this.som.decide("Is it short?", comment, { effort: "low" });
				await this.som.decide("Does it restate?", comment, { effort: "high" });
				return [];
			}
		`,
		);
		await sandbox.fs.mkdir(`${sandbox.root}/.wiz`);
		await sandbox.fs.write(
			`${sandbox.root}/.wiz/config.ts`,
			'export default { scry: { models: { som: { default: "clef", low: "jev-latest" } } } };\n',
		);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);

		await sandbox.run();

		expect(sandbox.asked).toEqual(["jev-latest", "clef"]);
	});

	it("asks a profile's models over the config's with --profile", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.mkdir(`${sandbox.root}/.wiz`);
		await sandbox.fs.write(
			`${sandbox.root}/.wiz/config.ts`,
			'export default { scry: { profiles: { "double-check": { som: "jev-latest" } } } };\n',
		);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);

		await sandbox.run("text", [], "double-check");

		expect(sandbox.asked).toEqual(["jev-latest"]);
	});

	it("answers from earlier runs what it was asked about an unchanged file", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0, { input: 7000 });

		await sandbox.run();
		await sandbox.run();

		expect(
			sandbox
				.printed()
				.split("\n")
				.filter((line) => line.includes("asked")),
		).toEqual([
			"  asked 1 question in 1 request, 7k input tokens",
			"  asked 0 questions in 0 requests, 1 answered from earlier runs",
		]);
	});

	it("reports a rule whose check threw as not checked, and exits 2", async () => {
		await sandbox.install(
			"fragile",
			"async check() { throw new Error('boom'); }",
		);

		await sandbox.run();

		expect(sandbox.printed()).toContain(
			["not checked", "  fragile on a.ts   boom"].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([1]);
	});

	it("exits 2 when something went unchecked and nothing is an error", async () => {
		await sandbox.install(
			"fragile",
			"async check() { throw new Error('boom'); }",
		);
		await sandbox.fs.write(`${sandbox.root}/a.ts`, "const a = 2;\n");

		await sandbox.run();

		expect(sandbox.proc.exits).toEqual([2]);
	});

	it("checks with only the rules it is given", async () => {
		await sandbox.install("no-const", sandbox.flagging("const"));

		await check({
			paths: ["a.ts"],
			rules: ["no-const"],
			format: "json",
			...sandbox.deps,
		});

		expect(
			JSON.parse(sandbox.printed()).problems.map(
				({ rule }: { rule: string }) => rule,
			),
		).toEqual(["no-const"]);
	});
});

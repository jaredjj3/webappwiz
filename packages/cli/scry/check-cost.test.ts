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

	it("says what a check would cost with --cost, counting what it would ask rather than asking", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\n// and two\nconst a = 1;\n",
		);
		const counting = new FakeJudge(0.9, { input: 4200 });
		sandbox.judge = counting;

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			...sandbox.deps,
		});

		expect(sandbox.printed()).toEqual(
			"estimated 4.2k input tokens to check 1 file: 2 questions in 1 request",
		);
		expect([counting.judgments, sandbox.proc.exits]).toEqual([[], []]);
	});

	it("keeps nothing it counted with --cost, so a check after still asks", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0.2, { input: 300 });

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			...sandbox.deps,
		});
		await sandbox.run();
		await check({
			paths: ["a.ts"],
			format: "json",
			cost: true,
			...sandbox.deps,
		});

		const lines = sandbox.printed().split("\n");
		expect(lines.slice(0, 3)).toEqual([
			"estimated 300 input tokens to check 1 file: 1 question in 1 request",
			"✔ no problems in 1 file",
			"  asked 1 question in 1 request, 300 input tokens",
		]);
		// what the check was told costs nothing again
		expect(JSON.parse(lines.slice(3).join("\n"))).toEqual({
			files: 1,
			unchecked: [],
			cancelled: false,
			spent: { requests: 0, questions: 0, input: 0, cached: 1 },
		});
	});

	it("names what --cost could not count, and exits 2", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = new FakeJudge(0);
		sandbox.judge.count = async () => {
			throw new Error("clef needs CLOUDFLARE_API_TOKEN");
		};

		await check({
			paths: ["a.ts"],
			format: "text",
			cost: true,
			...sandbox.deps,
		});

		expect(sandbox.printed()).toEqual(
			[
				"not counted",
				"  why-not-what on a.ts   clef needs CLOUDFLARE_API_TOKEN",
				"",
				"estimated 0 input tokens to check 1 file: 1 question in 1 request, but 1 not counted",
			].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([2]);
	});
});

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

	it("stops on the first ctrl-c, reports what came back, and quits on the next", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.judge = {
			judge: () => {
				// once sandbox.asked, so the check is listening, however long it took to start
				setTimeout(() => sandbox.proc.dispatch("SIGINT"));
				return new Promise(() => undefined);
			},
			count: async () => 0,
		};

		await sandbox.run();

		expect(sandbox.printed()).toEqual(
			[
				"not checked",
				"  why-not-what on a.ts   cancelled",
				"",
				"⚠ cancelled: no problems found in 1 file, but 1 not checked",
				"  asked 1 question in 1 request",
			].join("\n"),
		);
		expect(sandbox.proc.exits).toEqual([2]);
		sandbox.proc.dispatch("SIGINT");
		expect(sandbox.proc.exits).toEqual([2, 130]);
	});

	it("draws what is done and asked on a live screen as it checks, and erases it before the report", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.screen = sandbox.recording(true);
		const answering = new FakeJudge(0.2);
		sandbox.judge = {
			judge: (judgment) => {
				sandbox.timer.fireIntervals();
				return answering.judge(judgment);
			},
			count: async () => 0,
		};

		await sandbox.run();

		expect(sandbox.drawn).toEqual([
			{
				text: "\r⠋ checking 0 of 1 file · 1 question asked, 0 answered\u001B[K",
				printed: 0,
			},
			{ text: "\r\u001B[K", printed: 0 },
		]);
		expect(sandbox.printed()).toEqual(
			["✔ no problems in 1 file", "  asked 1 question in 1 request"].join("\n"),
		);
		expect(sandbox.timer.intervals.every((entry) => entry.disposed)).toBe(true);
	});

	it("draws nothing for a report in JSON, nor on a screen that is not live", async () => {
		sandbox.screen = sandbox.recording(true);
		await sandbox.run("json");
		sandbox.screen = sandbox.recording(false);
		await sandbox.run();

		expect([sandbox.drawn, sandbox.timer.intervals]).toEqual([[], []]);
	});

	it("erases its line before quitting on a second ctrl-c", async () => {
		await sandbox.install("why-not-what", sandbox.asking);
		await sandbox.fs.write(
			`${sandbox.root}/a.ts`,
			"// add one\nconst a = 1;\n",
		);
		sandbox.screen = sandbox.recording(true);
		sandbox.judge = {
			judge: () => {
				sandbox.timer.fireIntervals();
				sandbox.proc.dispatch("SIGINT");
				sandbox.proc.dispatch("SIGINT");
				return new Promise(() => undefined);
			},
			count: async () => 0,
		};

		await sandbox.run();

		expect(sandbox.proc.exits[0]).toBe(130);
		expect(sandbox.drawn.map(({ text }) => text)).toEqual([
			"\r⠋ checking 0 of 1 file · 1 question asked, 0 answered\u001B[K",
			"\r\u001B[K",
		]);
	});
});

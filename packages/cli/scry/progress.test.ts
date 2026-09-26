import { beforeEach, describe, expect, it } from "bun:test";
import { type Agent, Check, Rules } from "@webappwiz/scry";
import { FakeAgent, ruleDoc } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { FakeFs } from "webappwiz/system/testing";
import { Duration } from "webappwiz/time";
import { FakeClock, FakeTimer } from "webappwiz/time/testing";
import { Progress } from "./progress";

describe("Progress", () => {
	let fs: FakeFs;
	let clock: FakeClock;
	let timer: FakeTimer;
	let log: MemoryLogger;
	let written: string[];

	const prepare = async () =>
		Check.prepare({
			dir: "/p",
			rules: await Rules.load("/p", { fs }),
			changes: {
				since: "main",
				files: [
					{ path: "a.ts", diff: "+a" },
					{ path: "b.ts", diff: "+b" },
				],
			},
			batch: 1,
			fs,
		});

	const screen = (live: boolean) => ({
		live,
		columns: 80,
		write: (text: string) => {
			written.push(text);
		},
	});

	beforeEach(async () => {
		fs = new FakeFs();
		clock = new FakeClock();
		timer = new FakeTimer();
		log = new MemoryLogger();
		written = [];
		await fs.mkdir("/p/.wiz/scry/no-foo");
		await fs.write("/p/.wiz/scry/no-foo/RULE.md", ruleDoc("no-foo"));
		await fs.write("/p/a.ts", "a\n");
		await fs.write("/p/b.ts", "b\n");
	});

	it("shows each call queued, then running with its time, then how it went", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});
		const agent = {
			ask: async () => {
				clock.advance(Duration.secs(3));
				return '[{"file": "a.ts", "rule": "no-foo", "line": 1, "message": "x"}]';
			},
		};

		progress.start("sending 2 calls");
		expect(progress.lines().map(color.strip)).toEqual([
			"  · medium       a.ts",
			"  · medium       b.ts",
		]);
		await check.run({ agents: new Map([["medium", agent]]), jobs: 1 });
		progress.dispose();

		expect(progress.lines().map(color.strip)).toEqual([
			"  ● medium   3s  a.ts  1 error",
			"  ✔ medium   3s  b.ts",
		]);
		expect(timer.intervals.every((entry) => entry.disposed)).toBe(true);
	});

	it("redraws in place, moving back over the lines it drew last", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});

		progress.start("sending 2 calls");
		await check.run({
			agents: new Map([["medium", new FakeAgent("[]")]]),
			jobs: 1,
		});
		progress.dispose();

		expect(color.strip(written[0])).toEqual(
			"sending 2 calls · ctrl-c stops and reports what is in\n",
		);
		expect(written[1]).not.toContain("\u001B[2F");
		expect(
			written.slice(2).every((frame) => frame.startsWith("\u001B[2F")),
		).toBe(true);
	});

	it("shows a spinner and the running time while a call is out", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});
		let seen: string[] = [];
		const agent = {
			ask: async () => {
				clock.advance(Duration.secs(12));
				timer.intervals[0]?.callback();
				if (seen.length === 0) {
					seen = progress.lines().map(color.strip);
				}
				return "[]";
			},
		};

		progress.start("sending 2 calls");
		await check.run({ agents: new Map([["medium", agent]]), jobs: 1 });
		progress.dispose();

		expect(seen).toEqual(["  ⠙ medium  12s  a.ts", "  · medium       b.ts"]);
	});

	it("writes a plain line as each call comes back when the screen is not live", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(false),
			log,
			clock,
			timer,
		});

		progress.start("sending 2 calls");
		await check.run({
			agents: new Map([["medium", new FakeAgent(new Error("down"))]]),
			jobs: 1,
		});
		progress.dispose();

		expect(written).toEqual([]);
		expect(timer.intervals).toEqual([]);
		expect(
			log.entries.map((entry) => color.strip(String(entry.message))),
		).toEqual([
			"sending 2 calls",
			"  [1/2] medium: a.ts (0s, failed)",
			"  [2/2] medium: b.ts (0s, failed)",
		]);
	});

	it("marks the calls a cancel cut short, out or not, as cancelled", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});
		const cancel = new AbortController();
		const agent = {
			ask: () => {
				clock.advance(Duration.secs(4));
				cancel.abort();
				return new Promise<string>(() => undefined);
			},
		};

		progress.start("sending 2 calls");
		await check.run({
			agents: new Map([["medium", agent]]),
			jobs: 1,
			signal: cancel.signal,
		});
		progress.dispose();

		expect(progress.lines().map(color.strip)).toEqual([
			"  ■ medium   4s  a.ts  cancelled",
			"  ■ medium       b.ts  cancelled",
		]);
	});

	it("shows what a running call's agent says it is doing", async () => {
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});
		let seen: string[] = [];
		const agent: Agent = {
			ask: async (_prompt, opts) => {
				opts?.observer?.status("thinking ~40 tokens");
				if (seen.length === 0) {
					seen = progress.lines().map(color.strip);
				}
				return "[]";
			},
		};

		progress.start("sending 2 calls");
		await check.run({ agents: new Map([["medium", agent]]), jobs: 1 });
		progress.dispose();

		expect(seen[0]).toEqual("  ⠋ medium   0s  a.ts  thinking ~40 tokens");
		expect(progress.lines().map(color.strip)[0]).toEqual(
			"  ✔ medium   0s  a.ts",
		);
	});

	it("colors errors red and warnings yellow in what a call found", async () => {
		await fs.mkdir("/p/.wiz/scry/soft");
		await fs.write(
			"/p/.wiz/scry/soft/RULE.md",
			ruleDoc("soft", { level: "warning" }),
		);
		const check = await prepare();
		const progress = new Progress(check, {
			screen: screen(true),
			log,
			clock,
			timer,
		});
		const agent = new FakeAgent(
			JSON.stringify([
				{ file: "a.ts", rule: "no-foo", line: 1, message: "x" },
				{ file: "a.ts", rule: "soft", line: 1, message: "y" },
				{ file: "a.ts", rule: "soft", line: 1, message: "z" },
			]),
		);

		progress.start("sending 2 calls");
		await check.run({ agents: new Map([["medium", agent]]), jobs: 1 });
		progress.dispose();

		const [row] = progress.lines();
		expect(row).toContain(color.red("●"));
		expect(row).toContain(color.red("1 error"));
		expect(row).toContain(color.yellow("2 warnings"));
		expect(color.strip(row)).toEqual(
			"  ● medium   0s  a.ts  1 error, 2 warnings",
		);
	});
});

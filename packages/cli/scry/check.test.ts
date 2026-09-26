import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ruleDoc } from "@webappwiz/scry/testing";
import { color, MemoryLogger } from "webappwiz/log";
import { NodeFs, NodePs } from "webappwiz/system";
import { FakeProcess } from "webappwiz/system/testing";
import { FakeClock } from "webappwiz/time/testing";
import { check } from "./check";

describe("wiz scry", () => {
	const fs = new NodeFs();
	let root: string;
	let proc: FakeProcess;
	let ps: NodePs;
	let log: MemoryLogger;

	// plain lines, as on a pipe, whatever runs the tests
	const screen = { live: false, columns: 80, write: () => undefined };

	const answering = (reply: string) =>
		`cat > /dev/null; printf '%s' '${reply}'`;
	const FOUND = answering(
		'[{"rule": "no-foo", "line": 1, "message": "foo is here"}]',
	);

	const printed = () =>
		color.strip(
			log.entries
				.filter((entry) => entry.level === "info")
				.map((entry) => String(entry.message))
				.join("\n"),
		);
	const warned = () =>
		log.entries
			.filter((entry) => entry.level === "error")
			.map((entry) => String(entry.message));

	const git = async (...args: string[]) => {
		await ps.spawnCapture(["git", "-C", root, ...args]);
	};

	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), "rules-check-"));
		proc = new FakeProcess();
		// HOME points into the sandbox so no real user config is read
		proc.env = { PATH: process.env.PATH, HOME: root };
		ps = new NodePs({ proc });
		proc.chdir(root);
		log = new MemoryLogger();
		await git("init", "-q", "-b", "main");
		await git("config", "user.email", "t@example.com");
		await git("config", "user.name", "T");
		await fs.mkdir(`${root}/.wiz/scry/no-foo`);
		await fs.write(`${root}/.wiz/scry/no-foo/RULE.md`, ruleDoc("no-foo"));
		await fs.write(`${root}/a.ts`, "const a = 1;\n");
		await git("add", ".");
		await git("commit", "-qm", "base");
		await fs.write(`${root}/a.ts`, "const foo = 1;\n");
	});

	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	const run = (
		prompt: string | null = null,
		format = "text",
		paths: string[] = [],
	) => check({ paths, format, log, fs, ps, screen, prompt: () => prompt });

	it("prints the findings under their file and exits 1 on an error", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;

		await run();

		expect(printed()).toEqual(
			[
				"a.ts",
				"  1   error   foo is here   no-foo",
				"",
				"✖ 1 problem (1 error, 0 warnings) in 1 file since HEAD",
			].join("\n"),
		);
		expect(proc.exits).toEqual([1]);
	});

	it("says so when nothing breaks a rule, and exits 0", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = answering("[]");

		await run();

		expect(printed()).toEqual("✔ no problems in 1 file since HEAD");
		expect(proc.exits).toEqual([]);
	});

	it("prints the report as JSON when asked", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;

		await run(null, "json");

		expect(JSON.parse(printed())).toMatchObject({
			since: "HEAD",
			findings: [{ file: "a.ts", line: 1, rule: "no-foo", level: "error" }],
		});
	});

	it("reports a file whose agent failed as not checked, and exits 2", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = "echo broke >&2; exit 3";

		await run();

		expect(printed()).toContain("not checked");
		expect(printed()).toEndWith(
			"⚠ no problems found in 1 file since HEAD, but 1 not checked",
		);
		expect(printed()).toContain(
			"a.ts   `echo broke >&2; exit 3` exited 3: broke",
		);
		expect(proc.exits).toEqual([2]);
	});

	it("uses medium's agent for an effort with none of its own, and says so", async () => {
		await fs.write(
			`${root}/.wiz/scry/no-foo/RULE.md`,
			ruleDoc("no-foo", { effort: "low" }),
		);
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;

		await run();

		expect(warned()).toContain("no agent for effort low: using medium's");
		expect(printed()).toContain("foo is here");
	});

	it("refuses to run without a medium agent, and shows a config that would do", async () => {
		await expect(run()).rejects.toThrow(
			/no agent for effort medium: put one in \.wiz\/config\.ts/,
		);
	});

	it("asks before spending more than its budget, and runs on a yes", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;
		proc.env.WIZ_SCRY_BUDGET = "10";
		let asked = "";

		await check({
			paths: [],
			format: "text",
			log,
			fs,
			ps,
			screen,
			prompt: (question) => {
				asked = question;
				return "y";
			},
		});

		expect(asked).toMatch(
			/^~\d+ input tokens across 1 calls \(budget 10\)\. Proceed\? \[y\/N\]$/,
		);
		expect(printed()).toContain("foo is here");
	});

	it("does not run past its budget on anything but a yes", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;
		proc.env.WIZ_SCRY_BUDGET = "10";

		await run("n");

		expect(warned()).toEqual(["not run"]);
		expect(proc.exits).toEqual([2]);
	});

	it("says how to answer when no one can, and exits 2", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;
		proc.env.WIZ_SCRY_BUDGET = "10";

		await run(null);

		expect(warned().join("\n")).toContain(
			"no answer on stdin: ask, then rerun with the answer piped in, as in `echo y | wiz scry`",
		);
		expect(proc.exits).toEqual([2]);
	});

	it("says so when nothing changed", async () => {
		await git("commit", "-qam", "change");

		await run();

		expect(warned()).toEqual(["nothing changed since main"]);
	});

	it("checks only the changed files under the paths it is given, from the working directory", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = FOUND;
		await fs.mkdir(`${root}/src`);
		await fs.write(`${root}/src/b.ts`, "const foo = 2;\n");
		proc.chdir(`${root}/src`);

		await run(null, "json", ["."]);

		expect(JSON.parse(printed()).findings).toMatchObject([
			{ file: "src/b.ts", line: 1, rule: "no-foo" },
		]);
	});

	it("says where it looked when nothing changed under the paths", async () => {
		await fs.mkdir(`${root}/src`);

		await run(null, "text", ["src"]);

		expect(warned()).toEqual(["nothing changed since main in src"]);
	});

	it("says what it is sending, and each call as it comes back, on stderr", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = answering("[]");

		await check({
			paths: [],
			format: "text",
			log,
			fs,
			ps,
			screen,
			clock: new FakeClock(),
			prompt: () => null,
		});

		expect(warned().map((line) => color.strip(line))).toEqual([
			expect.stringMatching(
				/^sending 1 call \(~\d+ input tokens\), 1 at a time$/,
			),
			"  [1/1] medium: a.ts (0s)",
		]);
		expect(printed()).toEqual("✔ no problems in 1 file since HEAD");
	});

	it("stops on the first ctrl-c, reports what came back, and quits on the next", async () => {
		proc.env.WIZ_SCRY_AGENT_MEDIUM = "cat > /dev/null; sleep 5";
		setTimeout(() => proc.dispatch("SIGINT"), 200);

		await run();

		expect(printed()).toEqual(
			[
				"not checked",
				"  a.ts   cancelled",
				"",
				"⚠ cancelled: no problems found in 1 file since HEAD, but 1 not checked",
			].join("\n"),
		);
		expect(proc.exits).toEqual([2]);
		proc.dispatch("SIGINT");
		expect(proc.exits).toEqual([2, 130]);
	});

	it("says what the agents really spent when they report it", async () => {
		const result = JSON.stringify({
			type: "result",
			subtype: "success",
			is_error: false,
			result: "[]",
			total_cost_usd: 0.0412,
			usage: {
				input_tokens: 500,
				cache_read_input_tokens: 6500,
				output_tokens: 1200,
			},
		});
		proc.env.WIZ_SCRY_AGENT_MEDIUM = `cat > /dev/null; echo '${result}'`;

		await run();

		expect(printed()).toEqual(
			[
				"✔ no problems in 1 file since HEAD",
				"  spent 7k input tokens (6.5k cached) and 1.2k output, $0.04, across 1 call",
			].join("\n"),
		);
	});
});

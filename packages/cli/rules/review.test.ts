import { beforeEach, describe, expect, it } from "bun:test";
import { ruleDoc } from "@webappwiz/rules/testing";
import { MemoryLogger } from "webappwiz/log";
import { NodeGlob } from "webappwiz/system";
import { FakeFs, FakePs } from "webappwiz/system/testing";
import { review } from "./review";

describe("rules review", () => {
	let fs: FakeFs;
	let ps: FakePs;
	let log: MemoryLogger;

	const printed = () =>
		log.entries.map((entry) => String(entry.message)).join("\n");

	const install = async (id: string, doc: string) => {
		await fs.mkdir(`/p/.wiz/rules/${id}`);
		await fs.write(`/p/.wiz/rules/${id}/RULE.md`, doc);
	};

	const reviewing = (since = "main") => ({
		dir: "/p",
		since,
		chunk: 25,
		log,
		fs,
		ps,
		glob: new NodeGlob(),
	});

	beforeEach(() => {
		fs = new FakeFs();
		ps = new FakePs();
		log = new MemoryLogger();
	});

	it("gathers the rules a block holds, and prints them after a summary", async () => {
		await install("no-foo", ruleDoc("no-foo", { complexity: "low" }));
		await install("no-fox", ruleDoc("no-fox", { complexity: "low" }));
		await install("no-bar", ruleDoc("no-bar", { files: "**/*.md" }));
		await install("no-baz", ruleDoc("no-baz", { files: "**/*.py" }));
		ps.setCaptureOutput("src/a.ts\nREADME.md\n", "");

		await review(reviewing());

		expect(printed().split("\n")[0]).toEqual(
			"2 files changed since main; 3 rules matched, 2 blocks to review",
		);
		expect(printed()).toContain(
			"\n## block 1 (1 rule, 1 file, complexity medium)\n",
		);
		expect(printed()).toContain(
			"\n## block 2 (2 rules, 1 file, complexity low)\n",
		);
		expect(printed()).toContain("`.wiz/rules/no-foo/RULE.md` (no-foo, error)");
		expect(printed()).toContain("`.wiz/rules/no-fox/RULE.md` (no-fox, error)");
		expect(printed()).not.toContain("no-baz");
	});

	it("measures the change from the ref it is given", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		ps.setCaptureOutput("src/a.ts\n", "");

		await review(reviewing("v1.2.0"));

		expect(ps.getCalls()[0]).toContain(" v1.2.0");
		expect(printed()).toContain("`git diff v1.2.0 -- <file>`");
	});

	it("says so when nothing has changed", async () => {
		await install("no-foo", ruleDoc("no-foo"));
		ps.setCaptureOutput("", "");

		await review(reviewing());

		expect(printed()).toEqual("nothing has changed since main");
	});

	it("says so when no rule matches what changed", async () => {
		await install("no-foo", ruleDoc("no-foo", { files: "**/*.py" }));
		ps.setCaptureOutput("src/a.ts\n", "");

		await review(reviewing());

		expect(printed()).toEqual("no rule matches the 1 file changed since main");
	});

	it("refuses to review a project with no rules, and says how to get one", async () => {
		await expect(review(reviewing())).rejects.toThrow(
			"no rules in /p/.wiz/rules: copy one in with `rules add`, or write one with `rules new`",
		);
		expect(ps.getCalls()).toEqual([]);
	});

	it("refuses to review with a rule that does not parse", async () => {
		await install("broken", ruleDoc("broken").replace(/^name:.*\n/m, ""));

		await expect(review(reviewing())).rejects.toThrow(
			".wiz/rules/broken/RULE.md:1: name: ",
		);
	});
});

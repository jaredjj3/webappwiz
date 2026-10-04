import { describe, expect, it } from "bun:test";
import { Cases, SourceFile } from "@webappwiz/scry";
import { FakeDecider } from "@webappwiz/scry/testing";
import DevServersFindAPort from "./rule";

const cases = await Cases.load(import.meta.dir);

describe("dev-servers-find-a-port", () => {
	const rule = new DevServersFindAPort({ decider: new FakeDecider({}, 0.9) });

	it.each(cases.bad)("flags $name", async ({ file }) => {
		expect(await rule.check(file)).not.toEqual([]);
	});

	it.each(cases.good)("passes $name", async ({ file }) => {
		expect(await rule.check(file)).toEqual([]);
	});

	it("flags a fixed port in a URL, in options, and in a listen call", async () => {
		const file = new SourceFile(
			"a.ts",
			[
				'await fetch("http://localhost:4000/health");',
				"Bun.serve({ port: 3001, fetch });",
				"server.listen(8080);",
				"server.listen(0);",
			].join("\n"),
		);

		expect((await rule.check(file)).map((finding) => finding.line)).toEqual([
			1, 2, 3,
		]);
	});

	it("flags a URL that reports the port a server was asked for, not one it got or was handed", async () => {
		const file = new SourceFile(
			"a.ts",
			[
				"function start(from = 6006) {",
				"\tconst server = Bun.serve({ port: from, fetch });",
				`\tconsole.log(\`on http://localhost:\${from}\`);`,
				`\tconsole.log(\`on http://localhost:\${server.port}\`);`,
				"}",
				"serving(async (port) => {",
				`\tawait fetch(\`http://localhost:\${port}/\`);`,
				"});",
			].join("\n"),
		);

		expect(
			(await rule.check(file)).map((finding) => [
				finding.line,
				finding.message,
			]),
		).toEqual([
			[
				2,
				"This server tries one port: try the next one until it gets a listener.",
			],
			[
				3,
				"This reports the port asked for: report the port the server actually got.",
			],
		]);
	});

	it("asks the decider about a port in a config no server is handed", async () => {
		const decider = new FakeDecider({}, 0.1);
		const file = new SourceFile(
			"a.ts",
			'balancer.addListener("Listener", { port: 80, open: true });',
		);

		const findings = await new DevServersFindAPort({ decider }).check(file);

		expect([
			findings.map((finding) => [finding.line, finding.confidence]),
			decider.asked.map((asked) => asked.about.text),
		]).toEqual([[[1, 0.1]], ["80"]]);
	});

	it("asks the decider about a server started outside a loop, and not one inside", async () => {
		const decider = new FakeDecider({}, 0.3);
		const file = new SourceFile(
			"a.ts",
			[
				"Bun.serve({ port, fetch });",
				"for (let port = from; port < from + 20; port++) {",
				"\tserver.listen(port);",
				"}",
			].join("\n"),
		);

		const findings = await new DevServersFindAPort({ decider }).check(file);

		expect([
			findings.map((finding) => [finding.line, finding.confidence]),
			decider.asked.map((asked) => asked.about.line),
		]).toEqual([[[1, 0.3]], [1]]);
	});
});

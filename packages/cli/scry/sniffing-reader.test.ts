import { describe, expect, it } from "bun:test";
import type { Usage } from "@webappwiz/scry";
import { SniffingReader } from "./sniffing-reader";

describe("SniffingReader", () => {
	const listen = () => {
		const heard = { statuses: [] as string[], usage: [] as Usage[] };
		const reader = new SniffingReader({
			status: (status) => {
				heard.statuses.push(status);
			},
			usage: (usage) => {
				heard.usage.push(usage);
			},
		});
		return { heard, reader };
	};
	const result = JSON.stringify({
		type: "result",
		subtype: "success",
		is_error: false,
		result: "[]",
		usage: { input_tokens: 5, output_tokens: 2 },
	});

	it("reads Claude Code's JSON output for its events, streamed in pieces", () => {
		const { heard, reader } = listen();
		const stdout = `${JSON.stringify({ type: "system", subtype: "init" })}\n${result}\n`;

		reader.stdout(stdout.slice(0, 10));
		reader.stdout(stdout.slice(10));

		expect(reader.reply(stdout)).toEqual("[]");
		expect(heard.statuses).toEqual(["waiting on the model"]);
		expect(heard.usage).toEqual([{ input: 5, cached: 0, output: 2 }]);
	});

	it("reads a lone result with no newline, as --output-format json prints", () => {
		const { heard, reader } = listen();

		reader.stdout(result);

		expect(reader.reply(result)).toEqual("[]");
		expect(heard.usage).toHaveLength(1);
	});

	it("takes anything else as text, and shows stderr as it comes", () => {
		const { heard, reader } = listen();

		reader.stderr("loading\n");
		reader.stdout('Here: [{"rule": "x"}]\n');

		expect(reader.reply('Here: [{"rule": "x"}]\n')).toEqual(
			'Here: [{"rule": "x"}]\n',
		);
		expect(heard.statuses).toEqual(["loading", "reading ~6 tokens"]);
	});
});

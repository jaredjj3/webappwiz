import { describe, expect, it } from "bun:test";
import type { Usage } from "@webappwiz/scry";
import { ClaudeStreamReader } from "./claude-stream-reader";

// A real run, trimmed to the fields that matter
const STREAM = [
	{ type: "system", subtype: "init" },
	{ type: "stream_event", event: { type: "message_start" } },
	{
		type: "stream_event",
		event: { type: "content_block_start", content_block: { type: "thinking" } },
	},
	{ type: "rate_limit_event" },
	{
		type: "stream_event",
		event: {
			type: "content_block_delta",
			delta: { type: "thinking_delta", thinking: "Hmm, 12 chars" },
		},
	},
	{ type: "assistant" },
	{
		type: "stream_event",
		event: { type: "content_block_start", content_block: { type: "text" } },
	},
	{
		type: "stream_event",
		event: {
			type: "content_block_delta",
			delta: { type: "text_delta", text: "[]" },
		},
	},
	{ type: "stream_event", event: { type: "message_delta", delta: {} } },
	{
		type: "result",
		subtype: "success",
		is_error: false,
		result: "[]",
		total_cost_usd: 0.0018,
		usage: {
			input_tokens: 9,
			cache_creation_input_tokens: 100,
			cache_read_input_tokens: 6518,
			output_tokens: 50,
		},
	},
]
	.map((event) => JSON.stringify(event))
	.join("\n");

describe("ClaudeStreamReader", () => {
	const listen = () => {
		const heard = { statuses: [] as string[], usage: [] as Usage[] };
		const reader = new ClaudeStreamReader({
			status: (status) => {
				heard.statuses.push(status);
			},
			usage: (usage) => {
				heard.usage.push(usage);
			},
		});
		return { heard, reader };
	};

	it("says what the model is doing, and reports the reply and what it cost", () => {
		const { heard, reader } = listen();

		reader.stdout(`${STREAM}\n`);

		expect(reader.reply()).toEqual("[]");
		expect(heard.statuses).toEqual([
			"waiting on the model",
			"thinking",
			"thinking ~4 tokens",
			"writing",
			"writing ~1 tokens",
		]);
		expect(heard.usage).toEqual([
			{ input: 6627, cached: 6518, output: 50, cost: 0.0018 },
		]);
	});

	it("reads lines split across chunks, and a last line with no newline", () => {
		const { reader } = listen();
		const middle = Math.floor(STREAM.length / 2);

		reader.stdout(STREAM.slice(0, middle));
		reader.stdout(STREAM.slice(middle));

		expect(reader.reply()).toEqual("[]");
	});

	it("names the tool a model reaches for", () => {
		const { heard, reader } = listen();

		reader.stdout(
			`${JSON.stringify({
				type: "stream_event",
				event: {
					type: "content_block_start",
					content_block: { type: "tool_use", name: "Read" },
				},
			})}\n`,
		);

		expect(heard.statuses).toEqual(["using Read"]);
	});

	it("refuses a stream with no result, or an error for one", () => {
		const empty = listen().reader;
		empty.stdout("not json\n");
		expect(() => empty.reply()).toThrow(
			"the agent's stream ended without a result",
		);

		const failed = listen().reader;
		failed.stdout(
			JSON.stringify({
				type: "result",
				subtype: "error_max_turns",
				is_error: true,
			}),
		);
		expect(() => failed.reply()).toThrow("the agent failed: error_max_turns");
	});
});

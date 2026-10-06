import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Claude } from "./claude";
import type { Judgment } from "./judge";

describe("Claude", () => {
	let server: ReturnType<typeof Bun.serve>;
	let origin: string;
	let received: { path: string; key: string | null; body: unknown }[];
	let reply: Response;

	const judgment: Judgment = {
		state: { path: "a.ts", file: "1  let a = 1;" },
		questions: {
			q0: { type: "noul", instructions: "Is `file` a constant?" },
			q1: {
				type: "noul",
				instructions: "Does `file` name it well?",
				criteria: { true: "the name says what it holds", false: "it does not" },
			},
		},
	};

	/** A Messages API reply whose text is `answers`, as structured output writes it. */
	const message = (text: string, stop_reason = "end_turn") =>
		Response.json({
			id: "msg_1",
			type: "message",
			role: "assistant",
			model: "claude-sonnet-5-5",
			content: [{ type: "text", text }],
			stop_reason,
			stop_sequence: null,
			usage: {
				input_tokens: 120,
				output_tokens: 20,
				cache_read_input_tokens: 30,
				cache_creation_input_tokens: 0,
			},
		});

	beforeEach(() => {
		received = [];
		reply = message(JSON.stringify({ answers: { q0: 0.9, q1: 1.4 } }));
		server = Bun.serve({
			port: 0,
			fetch: async (request) => {
				received.push({
					path: new URL(request.url).pathname,
					key: request.headers.get("x-api-key"),
					body: await request.json(),
				});
				return reply.clone();
			},
		});
		origin = `http://localhost:${server.port}`;
	});

	afterEach(() => {
		server.stop(true);
	});

	it("asks every question in one message, constrained to an answer for each id", async () => {
		const verdict = await new Claude("claude-sonnet-5-5", "sk-key", {
			origin,
		}).judge(judgment);

		const [request] = received;
		expect(request?.path).toBe("/v1/messages");
		expect(request?.key).toBe("sk-key");
		const body = request?.body as {
			model: string;
			messages: { content: string }[];
			output_config: { format: { schema: { properties: object } } };
		};
		expect(body.model).toBe("claude-sonnet-5-5");
		const content = body.messages[0]?.content ?? "";
		expect(content).toContain('"path": "a.ts"');
		expect(content).toContain('<question id="q0">\nIs `file` a constant?');
		expect(content).toContain("Yes means: the name says what it holds");
		expect(Object.keys(body.output_config.format.schema.properties)).toContain(
			"answers",
		);
		// a probability past 1 is read as 1
		expect(verdict).toEqual({
			answers: new Map([
				["q0", 0.9],
				["q1", 1],
			]),
			input: 150,
			model: "claude-sonnet-5-5",
		});
	});

	it("counts what a judgment would spend with Anthropic's token counting, sending what judging it would", async () => {
		reply = Response.json({ input_tokens: 512 });
		const claude = new Claude("claude-sonnet-5-5", "sk-key", { origin });

		const counted = await claude.count(judgment);

		const [request] = received;
		expect(request?.path).toBe("/v1/messages/count_tokens");
		const body = request?.body as {
			model: string;
			messages: { content: string }[];
			output_config: { format: { schema: { properties: object } } };
		};
		expect(body.model).toBe("claude-sonnet-5-5");
		expect(body.messages[0]?.content).toContain(
			'<question id="q0">\nIs `file` a constant?',
		);
		expect(Object.keys(body.output_config.format.schema.properties)).toContain(
			"answers",
		);
		expect(counted).toBe(512);
	});

	it("fails when Claude declines, rather than read no as the answer", async () => {
		reply = message("", "refusal");

		await expect(
			new Claude("claude-sonnet-5-5", "sk-key", { origin }).judge(judgment),
		).rejects.toThrow("claude-sonnet-5-5 declined to answer");
	});
});

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import type { Judge, JudgeOptions, Judgment, Noul, Verdict } from "./judge";

/** Where Claude is reached. */
export interface ClaudeOptions {
	/** `https://api.anthropic.com` when not given. */
	origin?: string;
}

const SYSTEM = `You answer yes-or-no questions about code, the way a careful reviewer would.

The user message holds the state the questions are about, as JSON, and then the questions, each under its id. A question names the parts of the state it reads by backticked path, like \`file\`.

For each question, give the probability, from 0 to 1, that the answer is yes: near 1 or 0 when the code settles it, nearer 0.5 the more it is a judgment call. Answer each question on its own; one answer never moves another.`;

/**
 * Claude on the Anthropic API, as a judge: a language model rather than a
 * decision model, for questions that take more reading than Clef or Jev
 * give them. It reasons before it answers, and says its own probability
 * rather than reading one off its tokens, so a rule that asks it is tuned
 * with `wiz scry eval` like any other, and its threshold set for it.
 */
export class Claude implements Judge {
	private client: Anthropic;

	constructor(
		/** As Anthropic names it, like `claude-sonnet-5-5`. */
		readonly model: string,
		/** An Anthropic API key. */
		apiKey: string,
		opts: ClaudeOptions = {},
	) {
		this.client = new Anthropic({ apiKey, baseURL: opts.origin });
	}

	async judge(judgment: Judgment, opts: JudgeOptions = {}): Promise<Verdict> {
		const ids = Object.keys(judgment.questions);
		const reply = answers(judgment);
		const response = await this.client.messages.create(
			{ ...this.request(judgment, reply), max_tokens: 16000 },
			{ signal: opts.signal },
		);
		// a refusal comes back with no answer to parse, so it is read first
		if (response.stop_reason === "refusal") {
			throw new Error(
				`${this.model} declined to answer${response.stop_details?.category ? ` (${response.stop_details.category})` : ""}`,
			);
		}
		const text = response.content
			.flatMap((block) => (block.type === "text" ? [block.text] : []))
			.join("");
		const parsed = reply.safeParse(json(text));
		if (!parsed.success) {
			throw new Error(
				`${this.model} answered with no answers in it (stopped for ${response.stop_reason})`,
			);
		}
		const { usage } = response;
		return {
			answers: new Map(
				ids.map((id) => [id, clamp(parsed.data.answers[id] ?? 0)]),
			),
			input:
				usage.input_tokens +
				(usage.cache_read_input_tokens ?? 0) +
				(usage.cache_creation_input_tokens ?? 0),
		};
	}

	/** Exact, from Anthropic's token counting, which is free. */
	async count(judgment: Judgment, opts: JudgeOptions = {}): Promise<number> {
		const counted = await this.client.messages.countTokens(
			this.request(judgment, answers(judgment)),
			{ signal: opts.signal },
		);
		return counted.input_tokens;
	}

	/** What a request for `judgment` sends, but for how long its answer may run. */
	private request(judgment: Judgment, reply: z.ZodType) {
		return {
			model: this.model,
			system: SYSTEM,
			messages: [{ role: "user" as const, content: asking(judgment) }],
			output_config: { format: zodOutputFormat(reply) },
		};
	}
}

/** The reply a judgment asks for: a probability under each question's id. */
function answers(judgment: Judgment) {
	const ids = Object.keys(judgment.questions);
	return z.object({
		answers: z.object(Object.fromEntries(ids.map((id) => [id, z.number()]))),
	});
}

/** The state, then each question under its id. */
function asking(judgment: Judgment): string {
	const questions = Object.entries(judgment.questions)
		.map(
			([id, noul]) => `<question id="${id}">\n${question(noul)}\n</question>`,
		)
		.join("\n");
	return `<state>\n${JSON.stringify(judgment.state, null, 2)}\n</state>\n\n${questions}`;
}

function question(noul: Noul): string {
	return noul.criteria === undefined
		? noul.instructions
		: `${noul.instructions}\nYes means: ${noul.criteria.true}\nNo means: ${noul.criteria.false}`;
}

function json(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** A probability, whatever the model wrote: structured output types a number, not its range. */
function clamp(probability: number): number {
	return Math.min(1, Math.max(0, probability));
}

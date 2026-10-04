import { z } from "zod";
import type { JudgeOptions, Judgment, Verdict } from "./judge";

/** What a request carries besides the judgment. */
export interface SystemOneEndpointOptions {
	/** Fields the provider wants beside `state` and `questions`, like `model`. */
	body?: Record<string, unknown>;
}

// Jev answers a noul as {type, noul}; Clef's docs show the bare number
const ANSWER = z.union([
	z.number(),
	z.object({ noul: z.number() }).transform((answer) => answer.noul),
]);

const REPLY = z.object({
	answers: z.record(z.string(), ANSWER),
	usage: z.optional(
		z.object({
			input_tokens: z.optional(z.number()),
			prompt_tokens: z.optional(z.number()),
		}),
	),
});

/**
 * One URL that speaks the Jev API, the System One request and reply Clef
 * shares. Clef and Jev each hold one; this is the part they have in common.
 */
export class SystemOneEndpoint {
	constructor(
		/**
		 * What its errors call it. Never the URL, which can hold an account
		 * id kept with the credentials.
		 */
		private readonly name: string,
		private readonly url: string,
		/** Sent as a bearer token. */
		private readonly token: string,
		private readonly opts: SystemOneEndpointOptions = {},
	) {}

	async judge(judgment: Judgment, opts: JudgeOptions = {}): Promise<Verdict> {
		const response = await fetch(this.url, {
			method: "POST",
			headers: {
				authorization: `Bearer ${this.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ ...this.opts.body, ...judgment }),
			signal: opts.signal,
		});
		const text = await response.text();
		const body = parse(text);
		if (!response.ok) {
			throw new Error(
				`${this.name} answered ${response.status}: ${complaint(body) ?? (text.trim().slice(0, 200) || response.statusText)}`,
			);
		}
		// Cloudflare's REST API wraps every reply in {result, success, errors}
		const reply = REPLY.safeParse(
			isRecord(body) && isRecord(body.result) ? body.result : body,
		);
		if (!reply.success) {
			throw new Error(`${this.name} answered with no answers in it`);
		}
		const { answers, usage } = reply.data;
		const input = usage?.input_tokens ?? usage?.prompt_tokens;
		return {
			answers: new Map(Object.entries(answers)),
			...(input === undefined ? {} : { input }),
		};
	}
}

function parse(text: string): unknown {
	try {
		return JSON.parse(text);
	} catch {
		return undefined;
	}
}

/** What an error reply says went wrong, in the places providers put it. */
function complaint(body: unknown): string | undefined {
	if (!isRecord(body)) {
		return undefined;
	}
	const first = Array.isArray(body.errors) ? body.errors[0] : undefined;
	for (const said of [
		isRecord(first) ? first.message : undefined,
		isRecord(body.error) ? body.error.message : body.error,
		body.message,
		body.detail,
	]) {
		if (typeof said === "string" && said !== "") {
			return said;
		}
	}
	return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

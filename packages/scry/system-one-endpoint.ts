import { Duration, SystemTimer, type Timer } from "webappwiz/time";
import { z } from "zod";
import type { JudgeOptions, Judgment, Verdict } from "./judge";

/** What a request carries besides the judgment, and how it is tried again. */
export interface SystemOneEndpointOptions {
	/** Fields the provider wants beside `state` and `questions`, like `model`. */
	body?: Record<string, unknown>;
	/** Waits between tries; real time when not given. */
	timer?: Timer;
}

/** How many times a request is tried in all before its refusal stands. */
const TRIES = 4;

/** The wait before the first retry, doubled before each one after. */
const BACKOFF = Duration.secs(1);

/** The longest a retry waits, even when the provider asks for longer: past it, the refusal stands. */
const LONGEST_WAIT = Duration.secs(30);

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
 * A provider that turns a request away for now, with a 429 or a 5xx, is
 * asked again a few times, after the wait its Retry-After asks for or an
 * exponential backoff with jitter, until the judgment's signal aborts.
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
		let response = await this.request(judgment, opts.signal);
		for (let retry = 0; retry < TRIES - 1; retry++) {
			const delay = this.retryDelay(response, retry);
			if (delay === undefined) {
				break;
			}
			// Unread, the body would hold the connection open through the wait
			await response.body?.cancel();
			await this.wait(delay, opts.signal);
			response = await this.request(judgment, opts.signal);
		}
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

	private request(
		judgment: Judgment,
		signal: AbortSignal | undefined,
	): Promise<Response> {
		return fetch(this.url, {
			method: "POST",
			headers: {
				authorization: `Bearer ${this.token}`,
				"content-type": "application/json",
			},
			body: JSON.stringify({ ...this.opts.body, ...judgment }),
			signal,
		});
	}

	/**
	 * How long to wait before trying again, counting retries from 0: what
	 * the reply's Retry-After asks for, else a doubling backoff with half
	 * of it random, so many requests turned away together do not return
	 * together. None when the refusal is not for now, or the wait is too long.
	 */
	private retryDelay(response: Response, retry: number): Duration | undefined {
		if (response.status !== 429 && response.status < 500) {
			return undefined;
		}
		const backoff = BACKOFF.multiply(2 ** retry);
		const delay =
			retryAfter(response) ??
			backoff.multiply(0.5).add(backoff.multiply(0.5 * Math.random()));
		return delay.isGreaterThan(LONGEST_WAIT) ? undefined : delay;
	}

	/** Waits out a delay, or rejects with the signal's reason once it aborts. */
	private wait(
		delay: Duration,
		signal: AbortSignal | undefined,
	): Promise<void> {
		return new Promise((resolve, reject) => {
			if (signal?.aborted) {
				reject(signal.reason);
				return;
			}
			const abort = () => {
				timeout.dispose();
				reject(signal?.reason);
			};
			const timeout = (this.opts.timer ?? new SystemTimer()).setTimeout(() => {
				signal?.removeEventListener("abort", abort);
				resolve();
			}, delay);
			signal?.addEventListener("abort", abort, { once: true });
		});
	}
}

/** The wait a reply's Retry-After asks for, when it gives one in seconds. */
function retryAfter(response: Response): Duration | undefined {
	const seconds = Number(response.headers.get("retry-after") ?? "");
	return response.headers.has("retry-after") && Number.isFinite(seconds)
		? Duration.secs(Math.max(0, seconds))
		: undefined;
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

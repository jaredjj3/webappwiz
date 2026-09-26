import type { AskObserver } from "@webappwiz/scry";
import type { OutputWatcher } from "webappwiz/system";
import { z } from "zod";

// Only the fields this reads; everything else in an event passes through.
const EVENT = z.looseObject({
	type: z.string(),
	subtype: z.string().optional(),
	event: z
		.looseObject({
			type: z.string(),
			content_block: z
				.looseObject({ type: z.string(), name: z.string().optional() })
				.optional(),
			delta: z
				.looseObject({
					type: z.string().optional(),
					text: z.string().optional(),
					thinking: z.string().optional(),
				})
				.optional(),
		})
		.optional(),
	is_error: z.boolean().optional(),
	result: z.string().optional(),
	total_cost_usd: z.number().optional(),
	usage: z
		.looseObject({
			input_tokens: z.number().optional(),
			output_tokens: z.number().optional(),
			cache_read_input_tokens: z.number().optional(),
			cache_creation_input_tokens: z.number().optional(),
		})
		.optional(),
});

type Event = z.infer<typeof EVENT>;

/**
 * Reads `claude -p --output-format stream-json --verbose
 * --include-partial-messages`: a JSON object a line, saying what the model
 * is doing as it does it, then a `result` with the reply and what the call
 * cost. A line that is not such an object is passed over.
 */
export class ClaudeStreamReader implements OutputWatcher {
	private pending = "";
	/** What the block being streamed is, and how much of it has come. */
	private block = { kind: "", length: 0 };
	private result: Event | undefined;

	constructor(private observer: AskObserver) {}

	stdout(chunk: string): void {
		const lines = `${this.pending}${chunk}`.split("\n");
		this.pending = lines.pop() ?? "";
		for (const line of lines) {
			this.line(line);
		}
	}

	stderr(): void {
		// it reports everything on stdout
	}

	/**
	 * The reply the `result` event held, once the command has exited 0.
	 * Throws when there was none, or it was an error.
	 */
	reply(): string {
		this.line(this.pending);
		this.pending = "";
		if (this.result === undefined) {
			throw new Error("the agent's stream ended without a result");
		}
		if (this.result.is_error || this.result.subtype !== "success") {
			throw new Error(
				`the agent failed: ${this.result.result ?? this.result.subtype}`,
			);
		}
		return this.result.result ?? "";
	}

	private line(line: string): void {
		if (line.trim() === "") {
			return;
		}
		let json: unknown;
		try {
			json = JSON.parse(line);
		} catch {
			return;
		}
		const parsed = EVENT.safeParse(json);
		if (parsed.success) {
			this.event(parsed.data);
		}
	}

	private event(event: Event): void {
		if (event.type === "system" && event.subtype === "init") {
			this.observer.status("waiting on the model");
		} else if (event.type === "result") {
			this.result = event;
			const usage = event.usage ?? {};
			const cached = usage.cache_read_input_tokens ?? 0;
			this.observer.usage({
				input:
					(usage.input_tokens ?? 0) +
					cached +
					(usage.cache_creation_input_tokens ?? 0),
				cached,
				output: usage.output_tokens ?? 0,
				...(event.total_cost_usd === undefined
					? {}
					: { cost: event.total_cost_usd }),
			});
		} else if (event.type === "stream_event" && event.event !== undefined) {
			this.stream(event.event);
		}
	}

	private stream(event: NonNullable<Event["event"]>): void {
		if (event.type === "content_block_start" && event.content_block) {
			const block = event.content_block;
			this.block = { kind: block.type, length: 0 };
			this.observer.status(
				block.type === "tool_use"
					? `using ${block.name ?? "a tool"}`
					: this.doing(),
			);
		} else if (event.type === "content_block_delta" && event.delta) {
			this.block.length += (
				event.delta.text ??
				event.delta.thinking ??
				""
			).length;
			this.observer.status(this.doing());
		}
	}

	private doing(): string {
		const verb = this.block.kind === "thinking" ? "thinking" : "writing";
		return this.block.length === 0
			? verb
			: `${verb} ~${Math.ceil(this.block.length / 4)} tokens`;
	}
}

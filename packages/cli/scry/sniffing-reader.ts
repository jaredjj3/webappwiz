import type { AskObserver } from "@webappwiz/scry";
import type { OutputWatcher } from "webappwiz/system";
import { ClaudeStreamReader } from "./claude-stream-reader";
import { TextReader } from "./text-reader";

/** Claude Code's JSON output opens with one of these, streamed or not. */
const CLAUDE_EVENTS = new Set(["system", "stream_event", "result"]);

/**
 * Reads an agent's output by what its first line turns out to be, so no
 * config has to say. Claude Code's JSON output, from `claude -p
 * --output-format stream-json --verbose --include-partial-messages` or
 * `--output-format json`, goes to a `ClaudeStreamReader`, which can say what
 * the model is doing and what the call cost. Anything else is text.
 */
export class SniffingReader implements OutputWatcher {
	private reader: TextReader | ClaudeStreamReader | undefined;
	private held = "";
	/** What shows stderr, whichever reader stdout gets: Claude Code writes none. */
	private text: TextReader;

	constructor(private observer: AskObserver) {
		this.text = new TextReader(observer);
	}

	stdout(chunk: string): void {
		if (this.reader !== undefined) {
			this.reader.stdout(chunk);
			return;
		}
		this.held += chunk;
		const end = this.held.indexOf("\n");
		if (end !== -1) {
			this.decide(this.held.slice(0, end));
		}
	}

	stderr(chunk: string): void {
		this.text.stderr(chunk);
	}

	/** The reply in all of `stdout`, once the command has exited 0. */
	reply(stdout: string): string {
		if (this.reader === undefined) {
			this.decide(this.held);
		}
		return (this.reader ?? this.text).reply(stdout);
	}

	private decide(first: string): void {
		this.reader = claude(first)
			? new ClaudeStreamReader(this.observer)
			: this.text;
		this.reader.stdout(this.held);
		this.held = "";
	}
}

function claude(line: string): boolean {
	try {
		const event: unknown = JSON.parse(line);
		return (
			typeof event === "object" &&
			event !== null &&
			"type" in event &&
			typeof event.type === "string" &&
			CLAUDE_EVENTS.has(event.type)
		);
	} catch {
		return false;
	}
}

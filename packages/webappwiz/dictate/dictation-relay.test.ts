import { describe, expect, it } from "bun:test";
import { DictationFailure } from "./dictation-failure";
import type { DictationMessage } from "./dictation-message";
import { type Cleanup, DictationRelay } from "./dictation-relay";
import { FakeTranscriber } from "./fake-transcriber";

describe("DictationRelay", () => {
	/** A relay over a socket that keeps all it was sent, and whether it hung up. */
	const relayed = (
		transcriber: Promise<FakeTranscriber>,
		cleanup?: Cleanup,
	) => {
		const said: DictationMessage[] = [];
		const { promise: hungUp, resolve } = Promise.withResolvers<void>();
		const relay = new DictationRelay(
			{
				send: (message) => said.push(JSON.parse(message)),
				hangUp: resolve,
			},
			transcriber,
			cleanup,
		);
		return { relay, said, hungUp };
	};

	it("says what it hears as the audio comes, then the final text, and hangs up", async () => {
		const { relay, said, hungUp } = relayed(
			Promise.resolve(new FakeTranscriber()),
		);
		relay.receive(new TextEncoder().encode("one "));
		relay.receive(new TextEncoder().encode("two"));
		relay.receive("finish");
		await hungUp;

		expect(said).toEqual([
			{ type: "heard", text: "heard: one " },
			{ type: "heard", text: "heard: one two" },
			{
				type: "done",
				text: "heard: one two",
				said: "heard: one two",
				applied: [],
				edits: [],
				decisions: [],
			},
		]);
		relay.dispose();
	});

	it("cleans up the final text before it goes back", async () => {
		const edit = {
			type: "tag",
			start: 0,
			end: 3,
			system: "scry",
			probability: 0.5,
		} as const;
		const { relay, said, hungUp } = relayed(
			Promise.resolve(new FakeTranscriber()),
			{
				clean: async (text) => ({
					text: text.toUpperCase(),
					edits: [edit],
					applied: [{ type: "filler", start: 0, end: 1, was: "h" }],
				}),
			},
		);
		relay.receive(new TextEncoder().encode("one"));
		relay.receive("finish");
		await hungUp;

		expect(said.at(-1)).toEqual({
			type: "done",
			text: "HEARD: ONE",
			said: "heard: one",
			applied: [{ type: "filler", start: 0, end: 1, was: "h" }],
			edits: [edit],
			decisions: [],
		});
		relay.dispose();
	});

	it("says the text as heard when the cleanup fails", async () => {
		const { relay, said, hungUp } = relayed(
			Promise.resolve(new FakeTranscriber()),
			{
				clean: async () => {
					throw new Error("no model");
				},
			},
		);
		relay.receive(new TextEncoder().encode("one"));
		relay.receive("finish");
		await hungUp;

		expect(said.at(-1)).toEqual({
			type: "done",
			text: "heard: one",
			said: "heard: one",
			applied: [],
			edits: [],
			decisions: [],
		});
		relay.dispose();
	});

	it("names the cred a transcriber that could not start needs", async () => {
		const { relay, said, hungUp } = relayed(
			Promise.reject(new DictationFailure("needs a key", "OPENAI_API_KEY")),
		);
		await hungUp;

		expect(said).toEqual([
			{ type: "failed", message: "needs a key", cred: "OPENAI_API_KEY" },
		]);
		relay.dispose();
	});

	it("says why the final text never came", async () => {
		const transcriber = new FakeTranscriber();
		transcriber.failure = new Error("bad key");
		const { relay, said, hungUp } = relayed(Promise.resolve(transcriber));
		relay.receive("finish");
		await hungUp;

		expect(said).toEqual([{ type: "failed", message: "bad key" }]);
		relay.dispose();
	});
});

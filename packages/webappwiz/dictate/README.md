# webappwiz/dictate

Dictation: what someone says into the browser's mic, as text that arrives
while they are still speaking. The page records PCM16 and streams it over a
WebSocket to its server, which relays it to a speech-to-text model and sends
the text back as it is heard. The model's key stays on the server.

On the page, `webappwiz/dictate/browser`:

```ts
import { BufferedSink } from "webappwiz/dictate";
import { BrowserMicrophone, DictationSocket } from "webappwiz/dictate/browser";

// On the tap itself, before any await: a phone only opens the mic for a
// gesture, and iOS Safari leaves audio started later silent.
const sink = new BufferedSink();
const recording = new BrowserMicrophone().start(sink);
const socket = await DictationSocket.open("wss://example.com/api/dictation");
sink.attach(socket);
socket.events.on("heard", (text) => draft.show(text));
(await recording).events.on("tick", (level) => meter.set(level ?? 0));

// On stop:
(await recording).dispose();
const text = await socket.finish();
```

On the server, `webappwiz/dictate/server`, a `DictationRelay` per socket:

```ts
import { DictationRelay } from "webappwiz/dictate";
import { OpenAiTranscriber } from "webappwiz/dictate/server";

const transcriber = new OpenAiTranscriber(key, {
	prompt: "A developer dictating a prompt for a coding agent.",
	keywords: ["webappwiz", "arbor"],
});

Bun.serve<DictationRelay>({
	fetch: (request, server) => {
		server.upgrade(request, { data: undefined as never });
	},
	websocket: {
		open: (socket) => {
			const peer = {
				send: (message: string) => socket.send(message),
				hangUp: () => socket.close(),
			};
			socket.data = new DictationRelay(peer, Promise.resolve(transcriber));
		},
		message: (socket, message) =>
			socket.data.receive(
				typeof message === "string" ? message : new Uint8Array(message),
			),
		close: (socket) => socket.data.dispose(),
	},
});
```

- A `Microphone` starts a `Recording` that sends its `AudioSink` a tenth of a
  second of PCM16 at `SAMPLE_RATE` at a time, and says how loud the input
  was every `TICK`, or null when no audio came, so a page can show that it
  hears and warn when it does not. It says `interrupted`, and why, when the
  page is hidden or a call takes the mic. `BrowserMicrophone` taps
  `getUserMedia` with an `AudioWorklet`, keeps the screen awake while it
  records, and resamples in `Pcm16Encoder`.
- A `DictationLink` is one take on its way to the server, which
  `DictationSocket` is over a WebSocket. `finish` resolves with the final
  text, or rejects with a `DictationFailure`, whose `cred` names the key the
  server lacks when that is why.
- A `Transcriber` opens a `Transcription` per take, which takes audio and
  says the text so far as it hears it. `OpenAiTranscriber` is OpenAI's
  Realtime API with `gpt-live-transcribe`; its `prompt` and `keywords` are
  where the words an app spells its own way go. A transcriber that rejects
  with a `DictationFailure` tells the page which cred to ask for.
- A `DictationRelay` takes a `Cleanup` as its third argument, which tidies
  the final text before `done` goes back, applying the edits it is sure of
  and returning the rest as `DictationEdit`s on `done.edits` for the page to
  offer. One that throws leaves the text as heard.
- `CleanupSequence` runs cleanups one after another, each on the text the
  one before left, carrying the edits an earlier one left open onto the
  later text and dropping any whose span a later one rewrote. One that
  throws is skipped.
- `ListFormatter` lays out the lists a take speaks as markdown lists,
  deciding with a `Decider` from `webappwiz/decide` in one request: code
  splits the text at sentence ends and at commas before cue words ("then",
  "second", "and finally"), the model says what each piece does, and code
  puts each item on its own line without its cue word, numbered when the
  items are steps. An item it is unsure of joins the one before, with a
  `type: "item"` edit to split it off. `LIST_THRESHOLDS` holds its cutoffs.
- `CorrectionDropper` drops what a speaker took back: code splits the text
  at sentence ends and at commas before a cue ("no", "wait", "I mean",
  "actually", "scratch that"), the model says in one request whether each
  cued piece replaces the one before, amends its last words, or neither,
  and code drops the words taken back with the cue, keeping the newer
  wording. A cue after a question is an answer, so it asks nothing. One it
  is unsure of stays, with a `type: "correction"` edit to drop it.
  `CORRECTION_THRESHOLDS` holds its cutoffs.
- `FillerDropper` drops "um" and "uh" outright, and asks the model in one
  request whether each "like", "kind of", "sort of", "you know", "I mean"
  and "so" is filler in its sentence, dropping it with the commas around
  it. One it is unsure of stays, with a `type: "filler"` edit to drop it.
  `FILLER_THRESHOLDS` holds its cutoffs.
- Run the droppers before the other cleanups, so those see only what stays.
- `DictationMessage` is what the server says on the socket, as JSON.

`webappwiz/dictate/testing` has `FakeMicrophone`, `FakeDictationLink` and
`FakeTranscriber`, which hear the bytes a test sends as text.

## Cues

`Recording.cue("start")` and `cue("stop")` play a soft synthesized chime on the take's own `AudioContext`, so no file ships and a phone that unlocked audio on the tap plays them. The start cue drops the mic's samples for its length so it never reaches the transcript; the stop cue plays after the mic is let go and keeps the context open until it ends.

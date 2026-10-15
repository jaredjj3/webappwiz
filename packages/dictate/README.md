# dictate

A playground for trying out dictation, apart from `arbor dev`: a page with a
record button that streams each take to a speech-to-text model and shows what
it hears as you speak.

```bash
bun run --cwd packages/dictate dev    # http://localhost:4320, or PORT=…
```

It reads `OPENAI_API_KEY` from the system's secret store, which
`arbor creds request OPENAI_API_KEY --device` puts there, and transcribes with
`gpt-live-transcribe` through OpenAI's Realtime API, given this repo's system
names and aliases from `arbor.systems.ts`, as a prompt and as keywords, so they
come out spelled its way.

The page taps the mic with an `AudioWorklet`, turns it into PCM16 at 24 kHz,
and sends it over a websocket to `/api/live`, which relays it to OpenAI and
sends back the text so far as it changes. Stop commits the take and waits for
its final text.

Every take, its audio (as WAV) and final transcript, is kept in memory by id
until the server stops, so a later step can work over one again without
recording it twice.

- `openai-transcriber.ts` is the only call to a speech-to-text model, behind
  `Transcriber`, with `FakeTranscriber` for tests.
- `takes.ts` keeps the takes; `live-take.ts` is one being recorded;
  `dictate-service.ts` is what the routes in `dictate-server.ts` call.
- `page/` is the React page: `DictationController` behind a plain
  `RecordButton` and the `LiveText` under it, with the mic behind
  `Microphone` so tests use a fake, and the socket in `LiveSocket`.

# dictate

A playground for trying out dictation, apart from `arbor dev`: a page with a
record button that sends each take to a speech-to-text model and shows what
it heard.

```bash
bun run --cwd packages/dictate dev    # http://localhost:4320, or PORT=…
```

It reads `OPENAI_API_KEY` from the system's secret store, which
`arbor creds request OPENAI_API_KEY --device` puts there, and transcribes with
`gpt-4o-transcribe`, prompted with this repo's system names and aliases from
`arbor.systems.ts` so they come out spelled its way.

Every take, its audio and transcript, is kept in memory by id until the server
stops, so a later step can work over one again without recording it twice.

- `openai-transcriber.ts` is the only call to a speech-to-text model.
- `takes.ts` keeps the takes; `dictate-service.ts` is what the routes in
  `dictate-server.ts` call.
- `page/` is the React page: `DictationController` behind a plain
  `RecordButton`, with the mic behind `Microphone` so tests use a fake.

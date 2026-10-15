# dictate

- The playground starts with `bun run --cwd packages/dictate dev`, on port 4320 unless `PORT` says otherwise. (2026-10-14, dictate-playground)
  → contradicted 2026-10-15 in dictate-record-control: the user had the mic moved into the `arbor dev` composer and `packages/dictate` dropped, with the reusable part in `webappwiz/dictate`
- The transcription prompt names webappwiz, wiz, arbor and scry, then every system and alias in `arbor.systems.ts`. (2026-10-14, dictate-playground)
  → replaced 2026-10-15 in dictate-record-control: assumed it names arbor, the project's folder name, and each system's name and aliases
- The package is `dictate`, private and unpublished, like `wiz`. (2026-10-14, dictate-playground)
  → contradicted 2026-10-15 in dictate-record-control: the package is gone; dictation is the published `webappwiz/dictate` subpath and the `arbor dev` composer
- A take comes in only over the `/api/live` websocket; the upload-after-Stop route is gone, and the live transcription's final text is the take's. (2026-10-15, dictate-live)
  → contradicted 2026-10-15 in dictate-record-control: a take comes in over `arbor dev`'s `/api/dictation`, and its final text goes into the composer's message
- The vocabulary goes to the model as the prompt and its words as `keywords` too. (2026-10-15, dictate-live)
- A take's audio is kept as WAV, built from the PCM16 the server was sent. (2026-10-15, dictate-live)
  → contradicted 2026-10-15 in dictate-record-control: with the playground gone, no take is kept; its audio goes only to the transcriber
- Only the playground's own page may open a live socket, by its Origin; a client sending no Origin is let in. (2026-10-15, dictate-live)
  → replaced 2026-10-15 in dictate-record-control: assumed `/api/dictation` sits behind the `arbor dev` gate, and refuses an Origin other than its own host, or none
- The composer asks whether the mic hears after 4 seconds below about -54 dBFS. (2026-10-15, dictate-record-control)
- A take stops when the page is hidden, a call takes the mic or the mic goes away, keeping its words in the message and saying why. (2026-10-15, dictate-record-control)
- When OpenAI breaks off mid-take, the take ends then, keeping the words heard so far. (2026-10-15, dictate-record-control)
- A tap while the mic is still opening cancels the take. (2026-10-15, dictate-record-control)
- On a phone the mic is in the conversation composer only, not the inbox's launcher. (2026-10-15, dictate-record-control)
- Dictation's `OPENAI_API_KEY` is a device cred, requested on the Creds page the first time a take needs it. (2026-10-15, dictate-record-control)
- `webappwiz/dictate` runs anywhere at its root, with `/browser` for the mic and socket, `/server` for OpenAI and `/testing` for the fakes; `DictationSocket.open` takes the URL. (2026-10-15, dictate-record-control)
- The cleanups go in `webappwiz/dictate` (lists, filler), the decision-model client in a webappwiz subpath of its own, and systems tagging and the review view in arbor. (2026-10-15, dictate-record-control)
- Asking for the mic breathes the glyph like the other waiting states, with no ripple round the button. (2026-10-15, dictate-record-control)
- While an agent runs, the mic shows beside the stop-generating button when the message is empty. (2026-10-15, dictate-record-control)

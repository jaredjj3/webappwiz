# dictate

- The playground starts with `bun run --cwd packages/dictate dev`, on port 4320 unless `PORT` says otherwise. (2026-10-14, dictate-playground)
- The transcription prompt names webappwiz, wiz, arbor and scry, then every system and alias in `arbor.systems.ts`. (2026-10-14, dictate-playground)
- The package is `dictate`, private and unpublished, like `wiz`. (2026-10-14, dictate-playground)
- A take comes in only over the `/api/live` websocket; the upload-after-Stop route is gone, and the live transcription's final text is the take's. (2026-10-15, dictate-live)
- The vocabulary goes to the model as the prompt and its words as `keywords` too. (2026-10-15, dictate-live)
- A take's audio is kept as WAV, built from the PCM16 the server was sent. (2026-10-15, dictate-live)
- Only the playground's own page may open a live socket, by its Origin; a client sending no Origin is let in. (2026-10-15, dictate-live)

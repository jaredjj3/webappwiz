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
- Dictation chimes: two soft sine notes of 70 ms at gain 0.08, rising on start and falling on stop, synthesized on the take's own `AudioContext`. (2026-10-15, dictate-sound-cues)
- The mic ignores its first ~190 ms after the start cue so the chime never enters the transcript. (2026-10-15, dictate-sound-cues)
- A system tag's probability is its span's Choice probability times the system's Noul; it applies above 0.8, is dropped below 0.2, and goes back as an edit between (`TAG_THRESHOLDS`). (2026-10-15, dictation-tag-systems)
- Only the systems some span may name get a Noul, so a take that names none asks nothing. (2026-10-15, dictation-tag-systems)
- A heard word may be a system's name exactly under 4 letters, a letter off for 4–7, two for 8+; words heard apart ("s cry") must keep every letter. (2026-10-15, dictation-tag-systems)
- `done.edits` carries only the middle-band tags, `{ type: "tag", start, end, system, probability }`, spanning `done.text` with the sure tags applied. (2026-10-15, dictation-tag-systems)
  → replaced 2026-10-15 in dictation-spoken-lists: assumed it also carries unsure list items, `{ type: "item", start, end, text, probability }`, spanning `done.text` after every cleanup ran
- A take whose cleanup fails, or whose model lacks creds, goes back as heard; the creds are asked for when the take starts. (2026-10-15, dictation-tag-systems)
  → replaced 2026-10-15 in dictation-spoken-lists: assumed a cleanup that fails is skipped and the others still apply; a model lacking creds still leaves the take as heard
- A question describes a system by its name, aliases and up to three globs, since systems have no description. (2026-10-15, dictation-tag-systems)
- The page sends its cleanup model as `?model=` on the dictation socket. (2026-10-15, dictation-tag-systems)
- Tagging runs first, then lists, one request after the other, each on the text the one before left. (2026-10-15, dictation-spoken-lists)
  → replaced 2026-10-15 in dictation-drop-corrections: assumed corrections, then filler, run before tagging and lists, so those see only what stays
- An edit a cleanup left open is carried onto a later cleanup's text through a case-blind character diff, and dropped when that cleanup changed its span. (2026-10-15, dictation-spoken-lists)
- A take asks about lists only when it splits into three or more segments, or two with a cue word opening the second. (2026-10-15, dictation-spoken-lists)
- A segment starts a list item above 0.6 and is never offered as one below 0.2; a list is numbered when its items average above 0.7 as steps (`LIST_THRESHOLDS`). (2026-10-15, dictation-spoken-lists)
- A list item loses a trailing comma or semicolon, and its full stop when it is one sentence. (2026-10-15, dictation-spoken-lists)
- An unsure split in a numbered list offers the next sure item's number, leaving later numbers one behind once accepted. (2026-10-15, dictation-spoken-lists)
- A list starts on the line after its intro, which ends in a colon, and a blank line follows it. (2026-10-15, dictation-spoken-lists)
- Corrections run first, then filler, then tagging, then lists. (2026-10-15, dictation-drop-corrections)
- A correction is a segment opening with a cue, split at sentence ends and at commas before a cue; a Choice says whether it replaces the segment before whole, amends its last words, or neither. (2026-10-15, dictation-drop-corrections)
- An amend runs from the last word of the segment before that the newer wording opens with, else as many trailing words as its first clause has. (2026-10-15, dictation-drop-corrections)
- "no", "nope", "wait", "sorry" and "actually" cue a correction only before punctuation or another cue; "I mean", "scratch that", "never mind", "or rather" and "let me rephrase" anywhere; a cue after a question is an answer and asks nothing. (2026-10-15, dictation-drop-corrections)
- A correction amends rather than replaces when the model leans that way, or its newer wording has under half the words of the segment before. (2026-10-15, dictation-drop-corrections)
- A correction applies above 0.9 and filler above 0.8, both offered from 0.3 (`CORRECTION_THRESHOLDS`, `FILLER_THRESHOLDS`). (2026-10-15, dictation-drop-corrections)
- "um", "uh", "erm" and "hmm" are dropped without asking; "like", "kind of", "sort of", "you know", "I mean" and "so" get a Noul each. (2026-10-15, dictation-drop-corrections)
- Deletions go back as `{ type: "correction" | "filler", start, end, text, probability }`, `text` empty or the capital of what follows. (2026-10-15, dictation-drop-corrections)

---
version: 0.0.52
---
# Code is readable

Code reads as it runs. A reviewer, person or agent, has to be able to see
what a change does from its text, so nothing in the source may be hidden
from them:

- **No invisible or reordering characters.** Bidirectional controls make a
  line display in a different order than it runs (Trojan Source,
  CVE-2021-42574). Zero-width characters, word joiners, Hangul fillers,
  variation selectors, tag characters and Private Use Area characters show
  as nothing, and can carry a whole payload a decoder later runs, as the
  GlassWorm worm did, or instructions an agent reads and a person does not.
  When you need one of these characters, write it as an escape, like
  `"​"`, so it shows.
- **Nothing encoded in the source to decode at run time.** Base64, hex,
  `\x` escapes and character-code arrays turned back into a URL, a command
  or code are the most common way a malicious package hides what it does.
  Write the URL, command or code in plain text instead.

Decoding data the program receives is fine: an `Authorization` header, a
token, a response body, an uploaded file. So is encoded text that is
plainly data, like an image as a data URL, a test vector or a public key.
So is a joiner between letters of a script that needs it, or inside an
emoji, and a variation selector after an emoji.

```ts
// Hidden: what does this fetch?
const host = Buffer.from("ZXZpbC5leGFtcGxlLmNvbQ==", "base64").toString();

// Readable
const host = "evil.example.com";
```

Its cases are in `evals/`: each `.good.` file follows the rule, and each
`.bad.` file breaks it.

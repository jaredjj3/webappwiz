# webappwiz/decide

One client for the decision models: Jev through TypeSafe's HTTP API, and
Clef and Clef-flash through Workers AI. Ask typed questions about a state and
get an answer per question, each decision carrying its latency, tokens and
dollar cost. Keys stay on the server.

```ts
import { ClefDecider, JevDecider } from "webappwiz/decide";

const decider = new JevDecider(typesafeKey); // or new ClefDecider(accountId, token, { model: "clef-flash" })
const { answers, cost } = await decider.decide("Help! My payouts failed.", {
	urgent: { type: "noul", instructions: "Does this convey urgency?" },
});
```

Clef takes 1 to 64 questions a request, so `ClefDecider` splits larger sets
into parallel requests and sums their cost. Both models bill input tokens
only.

In a test, `FakeDecider` from `webappwiz/decide/testing` answers from
`decider.answers[id]` and records what it was asked in `decider.asked`.

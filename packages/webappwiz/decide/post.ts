import type { Clock, Duration } from "webappwiz/time";
import { DecisionFailure } from "./decision-failure";

/** Posts a JSON body, returning the parsed reply and how long it took. */
export async function post(
	fetcher: typeof fetch,
	clock: Clock,
	url: string,
	headers: Record<string, string>,
	body: unknown,
	signal: AbortSignal | undefined,
): Promise<{ json: unknown; latency: Duration }> {
	const start = clock.now();
	const response = await fetcher(url, {
		method: "POST",
		headers: { ...headers, "content-type": "application/json" },
		body: JSON.stringify(body),
		signal,
	});
	const text = await response.text();
	if (!response.ok) {
		throw new DecisionFailure(
			`${url} answered ${response.status}: ${text.slice(0, 300)}`,
			response.status,
		);
	}
	return { json: JSON.parse(text), latency: clock.now().subtract(start) };
}

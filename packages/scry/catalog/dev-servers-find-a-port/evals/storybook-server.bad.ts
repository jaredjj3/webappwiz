import { buildHandler } from "./storybook-handler.ts";

export function startStorybook(from = 6006) {
	const handler = buildHandler("stories");
	for (let port = from; port < from + 20; port++) {
		try {
			Bun.serve({ port, fetch: handler });
			console.log(`storybook on http://localhost:${from}`);
			return;
		} catch (error) {
			if (!String(error).includes("EADDRINUSE")) throw error;
		}
	}
	throw new Error(`no free port from ${from}`);
}

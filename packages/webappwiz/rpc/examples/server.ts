import { Service } from "webappwiz/rpc";
import { contract } from "./contract";
import { TimingMiddleware } from "./middleware";

/** A complete example: read uploads and return a named integrity report. */
export const service = new Service(
	contract,
	{
		audioReport: async ({ title }, { files }) => {
			const audio = [];
			for (const file of files.audio) {
				const bytes = await file.arrayBuffer();
				const hash = await crypto.subtle.digest("SHA-256", bytes);
				audio.push({
					name: file.name,
					contentType: file.type,
					bytes: file.size,
					sha256: Array.from(new Uint8Array(hash), (byte) =>
						byte.toString(16).padStart(2, "0"),
					).join(""),
				});
			}
			return new File(
				[JSON.stringify({ title, audio }, null, 2)],
				"audio-report.json",
				{ type: "application/json" },
			);
		},
	},
	{
		// Allows the 100 MB file payload plus multipart metadata/overhead.
		maxRequestBytes: 101_000_000,
		middleware: [new TimingMiddleware(console)],
	},
);

if (import.meta.main) {
	const server = Bun.serve({ port: 3000, fetch: service.fetch });
	console.log(`RPC audio example: ${server.url}`);
}

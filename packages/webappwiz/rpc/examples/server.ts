import { Service } from "webappwiz/rpc";
import { contract } from "./contract";
import { AudioReportHandlers } from "./handlers";
import { TimingMiddleware } from "./middleware";

/** Compose dependencies separately from the handler implementation. */
const handlers = new AudioReportHandlers(crypto.subtle);
export const service = new Service(contract, handlers, {
	// Allows the 100 MB file payload plus multipart metadata/overhead.
	maxRequestBytes: 101_000_000,
	middleware: [new TimingMiddleware(console)],
});

if (import.meta.main) {
	const server = Bun.serve({ port: 3000, fetch: service.fetch });
	console.log(`RPC audio example: ${server.url}`);
}

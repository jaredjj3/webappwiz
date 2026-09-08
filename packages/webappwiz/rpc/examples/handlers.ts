import type { Context, Handlers, In } from "webappwiz/rpc";
import type { contract } from "./contract";

/** The application implementation, independent of HTTP server setup. */
export class AudioReportHandlers implements Handlers<typeof contract> {
	constructor(private readonly crypto: SubtleCrypto) {}

	async audioReport(
		{ title }: In<typeof contract.audioReport>,
		{ files }: Context<typeof contract.audioReport>,
	): Promise<File> {
		const audio = [];
		for (const file of files.audio) {
			const bytes = await file.arrayBuffer();
			const hash = await this.crypto.digest("SHA-256", bytes);
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
	}
}

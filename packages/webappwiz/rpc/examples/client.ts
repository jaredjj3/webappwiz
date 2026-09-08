import { Client } from "webappwiz/rpc";
import { contract } from "./contract";

/** Pass File objects from a browser file input, drag/drop or another source. */
export async function uploadAudio(
	baseUrl: string,
	title: string,
	audio: File[],
) {
	const client = new Client(contract, baseUrl);
	const report = await client.call(
		"audioReport",
		{ title },
		{ files: { audio } },
	);
	// A buffered Blob and validated download metadata. Saving is explicit.
	return report;
}

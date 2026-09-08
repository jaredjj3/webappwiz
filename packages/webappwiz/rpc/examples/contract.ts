import { Binary, type Contract } from "webappwiz/rpc";
import { t } from "webappwiz/t";

/** Shared by the browser/client and server. No implementation code belongs here. */
export const contract = {
	audioReport: {
		type: "mutation",
		input: t.object({ title: t.string() }),
		files: {
			audio: Binary.files({ minCount: 1, maxCount: 8 })
				.audio()
				.maxMB(25)
				.maxTotalMB(100),
		},
		output: Binary.file().contentTypes("application/json").maxMB(1),
	},
} satisfies Contract;

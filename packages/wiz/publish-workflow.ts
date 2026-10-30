import { PublishWorkflow } from "webappwiz/ship";
import type { Fs } from "webappwiz/system";

/** What the generated workflow runs: this workspace's publish-only mode. */
export const PUBLISH_COMMAND = "bin/wiz dev ship publish";

/** The workflow that publishes this workspace's release from GitHub Actions. */
export function publishWorkflow(fs?: Fs): PublishWorkflow {
	return new PublishWorkflow({ command: PUBLISH_COMMAND, fs });
}

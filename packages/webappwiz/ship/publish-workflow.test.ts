import { beforeEach, describe, expect, it } from "bun:test";
import { FakeFs } from "webappwiz/system/testing";
import { PUBLISH_WORKFLOW_PATH, PublishWorkflow } from "./publish-workflow";

describe("publish workflow", () => {
	let fs: FakeFs;
	let workflow: PublishWorkflow;
	const path = `/repo/${PUBLISH_WORKFLOW_PATH}`;

	beforeEach(() => {
		fs = new FakeFs();
		workflow = new PublishWorkflow({ command: "bunx publish-it", fs });
	});

	it("runs the given command on the dispatched commit with an OIDC identity and no package list", () => {
		const text = workflow.text();

		expect(text).toContain("id-token: write");
		// biome-ignore lint/suspicious/noTemplateCurlyInString: GitHub Actions expression, not a JS template
		expect(text).toContain("ref: ${{ inputs.ref }}");
		expect(text).toContain("- run: bunx publish-it");
		expect(text).not.toContain("NPM_TOKEN");
	});

	it("writes the file when it is missing, then leaves it alone", async () => {
		expect(await workflow.drift("/repo")).toBe("missing");
		expect(await workflow.write("/repo")).toBe(true);
		expect(await fs.read(path)).toBe(workflow.text());
		expect(await workflow.write("/repo")).toBe(false);
		expect(await workflow.drift("/repo")).toBeUndefined();
	});

	it("rewrites a stale file", async () => {
		await fs.mkdir("/repo/.github/workflows", { recursive: true });
		await fs.write(path, "old\n");

		expect(await workflow.drift("/repo")).toBe("stale");
		expect(await workflow.write("/repo")).toBe(true);
		expect(await fs.read(path)).toBe(workflow.text());
	});

	it("fails the check on drift and passes it when current", async () => {
		await expect(workflow.check("/repo")).rejects.toThrow("is missing");
		await workflow.write("/repo");
		await workflow.check("/repo");
		await fs.write(path, "edited\n");
		await expect(workflow.check("/repo")).rejects.toThrow("is stale");
	});
});

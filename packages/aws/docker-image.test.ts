import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { DockerImage } from "./docker-image";

describe("DockerImage", () => {
	let stack: cdk.Stack;
	let buildContext: string;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
		// ponytail: a throwaway build context beats keeping a Dockerfile fixture in the repo
		buildContext = mkdtempSync(join(tmpdir(), "aws-docker-image-"));
		writeFileSync(join(buildContext, "Dockerfile"), "FROM scratch\n");
	});

	it("exposes a stable asset hash and the configured environment", () => {
		const image = new DockerImage(stack, "Image", {
			filePath: "Dockerfile",
			buildContext,
			env: { variables: { FOO: "bar" } },
		});

		expect(image.assetHash).toBeString();
		expect(image.environment).toEqual({ FOO: "bar" });
	});
});

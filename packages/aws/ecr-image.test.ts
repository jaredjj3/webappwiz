import { beforeEach, describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { EcrImage } from "./ecr-image";

describe("EcrImage", () => {
	let stack: cdk.Stack;
	let repository: ecr.IRepository;
	const digest = `sha256:${"a".repeat(64)}`;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
		repository = ecr.Repository.fromRepositoryName(
			stack,
			"Repository",
			"my-app",
		);
	});

	it("runs the specified digest and uses it as the cache key", () => {
		const image = new EcrImage(stack, "Image", {
			repository,
			digest,
			env: { variables: { FOO: "bar" } },
		});
		const taskDefinition = new ecs.FargateTaskDefinition(stack, "TaskDef");
		taskDefinition.addContainer("app", { image: image.containerImage });
		const template = Template.fromStack(stack);

		expect(image.assetHash).toBe(digest);
		expect(image.environment).toEqual({ FOO: "bar" });
		template.hasResourceProperties("AWS::ECS::TaskDefinition", {
			ContainerDefinitions: [
				Match.objectLike({
					Image: {
						"Fn::Join": [
							"",
							[
								"123456789012.dkr.ecr.us-east-1.",
								{ Ref: "AWS::URLSuffix" },
								`/my-app@${digest}`,
							],
						],
					},
				}),
			],
		});
		template.resourceCountIs("AWS::ECR::Repository", 0);
	});

	it("rejects mutable tags", () => {
		expect(
			() => new EcrImage(stack, "Image", { repository, digest: "latest" }),
		).toThrow("full sha256 digest");
	});
});

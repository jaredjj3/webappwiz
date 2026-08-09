import { describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Network } from "./network";

describe("Network", () => {
	it("provisions a single NAT gateway regardless of AZ count", () => {
		const stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
		new Network(stack, "Network", { maxAzs: 2 });
		const template = Template.fromStack(stack);

		expect(
			Object.keys(template.findResources("AWS::EC2::NatGateway")),
		).toHaveLength(1);
	});
});

import { beforeEach, describe, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import { Database } from "./database";
import { Network } from "./network";

describe("Database", () => {
	let stack: cdk.Stack;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
	});

	it("provisions a non-publicly-accessible Postgres instance in isolated subnets", () => {
		const network = new Network(stack, "Network", {
			name: "shared",
			cidr: "10.0.0.0/16",
		});
		new Database(stack, "Database", { vpc: network.vpc, databaseName: "app" });
		const template = Template.fromStack(stack);

		template.hasResourceProperties("AWS::RDS::DBInstance", {
			Engine: "postgres",
			DBName: "app",
			PubliclyAccessible: false,
		});
		template.hasResourceProperties("AWS::RDS::DBSubnetGroup", {
			SubnetIds: network.vpc.isolatedSubnets.map((subnet) =>
				stack.resolve(subnet.subnetId),
			),
		});
	});
});

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

	it("provisions a private, non-publicly-accessible Postgres instance", () => {
		const network = new Network(stack, "Network");
		new Database(stack, "Database", { vpc: network.vpc, databaseName: "app" });
		const template = Template.fromStack(stack);

		template.hasResourceProperties("AWS::RDS::DBInstance", {
			Engine: "postgres",
			DBName: "app",
			PubliclyAccessible: false,
		});
	});
});

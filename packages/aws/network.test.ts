import { beforeEach, describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import { Network } from "./network";

const networkProps = { name: "shared", cidr: "10.0.0.0/16" };

describe("Network", () => {
	let stack: cdk.Stack;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
	});

	it("spans two AZs with three subnet tiers, one NAT and a name tag", () => {
		const network = new Network(stack, "Network", networkProps);
		const template = Template.fromStack(stack);
		const subnets = [
			...network.vpc.publicSubnets,
			...network.vpc.privateSubnets,
			...network.vpc.isolatedSubnets,
		];

		expect(network.vpc.publicSubnets).toHaveLength(2);
		expect(network.vpc.privateSubnets).toHaveLength(2);
		expect(network.vpc.isolatedSubnets).toHaveLength(2);
		expect(
			new Set(subnets.map((subnet) => subnet.availabilityZone)),
		).toHaveLength(2);
		template.resourceCountIs("AWS::EC2::Subnet", 6);
		template.resourceCountIs("AWS::EC2::NatGateway", 1);
		template.hasResourceProperties("AWS::EC2::VPC", {
			CidrBlock: networkProps.cidr,
			Tags: [{ Key: "Name", Value: networkProps.name }],
		});
		template.resourceCountIs("AWS::EC2::FlowLog", 0);
		template.resourceCountIs("AWS::Route53Resolver::FirewallDomainList", 0);
		template.resourceCountIs("AWS::Route53Resolver::FirewallRuleGroup", 0);
		template.resourceCountIs(
			"AWS::Route53Resolver::FirewallRuleGroupAssociation",
			0,
		);
	});

	it("adds interface endpoints in both AZs and S3 and DynamoDB gateway endpoints", () => {
		new Network(stack, "Network", networkProps);
		const template = Template.fromStack(stack);
		const endpoints = Object.values(
			template.findResources("AWS::EC2::VPCEndpoint"),
		);
		const interfaceEndpoints = endpoints.filter(
			(endpoint) => endpoint.Properties.VpcEndpointType === "Interface",
		);
		const gatewayEndpoints = endpoints.filter(
			(endpoint) => endpoint.Properties.VpcEndpointType === "Gateway",
		);

		expect(interfaceEndpoints).toHaveLength(6);
		expect(
			interfaceEndpoints
				.map((endpoint) => endpoint.Properties.ServiceName)
				.sort(),
		).toEqual(
			[
				"com.amazonaws.us-east-1.ecr.api",
				"com.amazonaws.us-east-1.ecr.dkr",
				"com.amazonaws.us-east-1.logs",
				"com.amazonaws.us-east-1.secretsmanager",
				"com.amazonaws.us-east-1.ssm",
				"com.amazonaws.us-east-1.ssmmessages",
			].sort(),
		);
		expect(
			interfaceEndpoints.map((endpoint) => [
				endpoint.Properties.SubnetIds.length,
				endpoint.Properties.PrivateDnsEnabled,
			]),
		).toEqual([
			[2, true],
			[2, true],
			[2, true],
			[2, true],
			[2, true],
			[2, true],
		]);
		expect(gatewayEndpoints).toHaveLength(2);
		expect(
			gatewayEndpoints
				.map((endpoint) => endpoint.Properties.ServiceName["Fn::Join"][1][2])
				.sort(),
		).toEqual([".dynamodb", ".s3"]);
	});

	it("adds DNS Firewall and flow logs only when asked", () => {
		new Network(stack, "Network", {
			...networkProps,
			dnsFirewall: { allowedDomains: ["stripe.com", "*.stripe.com"] },
			flowLogs: true,
		});
		const template = Template.fromStack(stack);

		template.resourceCountIs("AWS::EC2::FlowLog", 1);
		template.hasResourceProperties("AWS::Route53Resolver::FirewallDomainList", {
			Domains: ["stripe.com", "*.stripe.com"],
		});
		template.hasResourceProperties("AWS::Route53Resolver::FirewallRuleGroup", {
			FirewallRules: [
				{
					Action: "ALLOW",
					Priority: 100,
					FirewallDomainListId: Match.anyValue(),
				},
				{ Action: "BLOCK", BlockResponse: "NODATA", Priority: 200 },
			],
		});
		template.hasResourceProperties(
			"AWS::Route53Resolver::FirewallRuleGroupAssociation",
			{ Priority: 100 },
		);
	});

	it("looks up a VPC by its Name tag", () => {
		const { key } = cdk.ContextProvider.getKey(stack, {
			provider: "vpc-provider",
			props: {
				filter: { "tag:Name": "shared" },
				returnAsymmetricSubnets: true,
			},
		});
		stack.node.setContext(key, {
			vpcId: "vpc-12345678",
			vpcCidrBlock: "10.0.0.0/16",
			availabilityZones: ["us-east-1a", "us-east-1b"],
			publicSubnetIds: [],
			privateSubnetIds: [],
			isolatedSubnetIds: [],
		});

		const network = Network.lookup(stack, "Lookup", { name: "shared" });

		expect(network.vpc.vpcId).toBe("vpc-12345678");
	});
});

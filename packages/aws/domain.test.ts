import { beforeEach, describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Domain } from "./domain";

describe("Domain", () => {
	let stack: cdk.Stack;
	let originLoadBalancer: elbv2.IApplicationLoadBalancer;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
		originLoadBalancer =
			elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
				stack,
				"Lb",
				{
					loadBalancerArn:
						"arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/Lb/50dc6c495c0c9188",
					loadBalancerDnsName: "Lb.us-east-1.elb.amazonaws.com",
					securityGroupId: "sg-12345678",
				},
			);
	});

	it("redirects www and any extra domains to the apex", () => {
		new Domain(stack, "Domain", {
			originLoadBalancer,
			domainName: "example.com",
			redirectDomains: [{ domainName: "example.net" }],
		});
		const template = Template.fromStack(stack);

		const distributions = template.findResources(
			"AWS::CloudFront::Distribution",
		) as Record<
			string,
			{ Properties: { DistributionConfig: { Aliases: string[] } } }
		>;
		expect(Object.keys(distributions)).toHaveLength(2);
		const domainNames = Object.values(distributions).flatMap(
			(d) => d.Properties.DistributionConfig.Aliases,
		);
		expect(domainNames.sort()).toEqual(
			[
				"example.com",
				"example.net",
				"www.example.com",
				"www.example.net",
			].sort(),
		);
	});

	it("skips the redirect distribution when there's nothing to redirect", () => {
		new Domain(stack, "Domain", {
			originLoadBalancer,
			domainName: "example.com",
			includeWww: false,
		});
		const template = Template.fromStack(stack);

		expect(
			Object.keys(template.findResources("AWS::CloudFront::Distribution")),
		).toHaveLength(1);
	});
});

import { describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { Domain } from "./domain";

function testStack(): cdk.Stack {
	return new cdk.Stack(new cdk.App(), "TestStack", {
		env: { account: "123456789012", region: "us-east-1" },
	});
}

function fakeLoadBalancer(
	stack: cdk.Stack,
	id: string,
): elbv2.IApplicationLoadBalancer {
	return elbv2.ApplicationLoadBalancer.fromApplicationLoadBalancerAttributes(
		stack,
		id,
		{
			loadBalancerArn: `arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/${id}/50dc6c495c0c9188`,
			loadBalancerDnsName: `${id}.us-east-1.elb.amazonaws.com`,
			securityGroupId: "sg-12345678",
		},
	);
}

describe("Domain", () => {
	it("redirects www and any extra domains to the apex", () => {
		const stack = testStack();
		const loadBalancer = fakeLoadBalancer(stack, "Lb");
		new Domain(stack, "Domain", {
			originLoadBalancer: loadBalancer,
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
		const stack = testStack();
		const loadBalancer = fakeLoadBalancer(stack, "Lb2");
		new Domain(stack, "Domain", {
			originLoadBalancer: loadBalancer,
			domainName: "example.com",
			includeWww: false,
		});
		const template = Template.fromStack(stack);

		expect(
			Object.keys(template.findResources("AWS::CloudFront::Distribution")),
		).toHaveLength(1);
	});
});

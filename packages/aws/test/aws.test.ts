import { describe, expect, it } from "bun:test";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import { DockerImage } from "../lib/constructs/docker-image";
import { Service, type ServiceProps } from "../lib/constructs/service";
import { Database } from "../lib/database";
import { Domain } from "../lib/domain";
import { Network } from "../lib/network";

function testStack(): cdk.Stack {
	const app = new cdk.App();
	return new cdk.Stack(app, "TestStack", {
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

describe("Network", () => {
	it("provisions a single NAT gateway regardless of AZ count", () => {
		const stack = testStack();
		new Network(stack, "Network", { maxAzs: 2 });
		const template = Template.fromStack(stack);

		expect(
			Object.keys(template.findResources("AWS::EC2::NatGateway")),
		).toHaveLength(1);
	});
});

describe("Database", () => {
	it("provisions a private, non-publicly-accessible Postgres instance", () => {
		const stack = testStack();
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

describe("DockerImage", () => {
	it("exposes a stable asset hash and the configured environment", () => {
		const stack = testStack();
		const image = new DockerImage(stack, "Image", {
			filePath: "Dockerfile",
			buildContext: `${import.meta.dir}/fixtures/docker`,
			env: { variables: { FOO: "bar" } },
		});

		expect(image.assetHash).toBeString();
		expect(image.environment).toEqual({ FOO: "bar" });
	});
});

describe("Service", () => {
	function testService(
		stack: cdk.Stack,
		props: Partial<ServiceProps> = {},
	): Service {
		const network = new Network(stack, "Network", { maxAzs: 2 });
		const cluster = new ecs.Cluster(stack, "Cluster", { vpc: network.vpc });
		cluster.addDefaultCloudMapNamespace({ name: "app.internal" });
		const image = new DockerImage(stack, "Image", {
			filePath: "Dockerfile",
			buildContext: `${import.meta.dir}/fixtures/docker`,
			env: { variables: { FOO: "bar" } },
		});
		return new Service(stack, "Service", {
			cluster,
			image,
			containerPort: 3000,
			...props,
		});
	}

	it("fronts the service with an internal load balancer when asked", () => {
		const stack = testStack();
		const service = testService(stack, {
			loadBalancer: { healthCheckPath: "/health", maxCapacity: 2 },
		});
		const template = Template.fromStack(stack);

		expect(service.loadBalancer).toBeDefined();
		template.hasResourceProperties(
			"AWS::ElasticLoadBalancingV2::LoadBalancer",
			{
				Scheme: "internal",
			},
		);
		template.hasResourceProperties("AWS::ElasticLoadBalancingV2::TargetGroup", {
			HealthCheckPath: "/health",
		});
		template.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 1);
	});

	it("stays private and Cloud Map discoverable without a load balancer", () => {
		const stack = testStack();
		const service = testService(stack, { discoveryName: "api" });
		const template = Template.fromStack(stack);

		expect(service.loadBalancer).toBeUndefined();
		template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
		template.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 0);
		template.hasResourceProperties("AWS::ServiceDiscovery::Service", {
			Name: "api",
		});
	});

	it("layers runtime environment over the image's build-time variables", () => {
		const stack = testStack();
		testService(stack, { environment: { FOO: "runtime" } });
		const template = Template.fromStack(stack);

		template.hasResourceProperties("AWS::ECS::TaskDefinition", {
			ContainerDefinitions: [
				Match.objectLike({
					Name: "app",
					Environment: Match.arrayWith([
						{ Name: "FOO", Value: "runtime" },
						{ Name: "PORT", Value: "3000" },
					]),
				}),
			],
		});
	});
});

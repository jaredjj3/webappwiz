import { describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { DockerImage } from "./docker-image";
import { Network } from "./network";
import { Service, type ServiceProps } from "./service";

// ponytail: a throwaway build context beats keeping a Dockerfile fixture in the repo
function dockerContext(): string {
	const dir = mkdtempSync(join(tmpdir(), "aws-service-"));
	writeFileSync(join(dir, "Dockerfile"), "FROM scratch\n");
	return dir;
}

function testService(
	stack: cdk.Stack,
	props: Partial<ServiceProps> = {},
): Service {
	const network = new Network(stack, "Network", { maxAzs: 2 });
	const cluster = new ecs.Cluster(stack, "Cluster", { vpc: network.vpc });
	cluster.addDefaultCloudMapNamespace({ name: "app.internal" });
	const image = new DockerImage(stack, "Image", {
		filePath: "Dockerfile",
		buildContext: dockerContext(),
		env: { variables: { FOO: "bar" } },
	});
	return new Service(stack, "Service", {
		cluster,
		image,
		containerPort: 3000,
		...props,
	});
}

function testStack(): cdk.Stack {
	return new cdk.Stack(new cdk.App(), "TestStack", {
		env: { account: "123456789012", region: "us-east-1" },
	});
}

describe("Service", () => {
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

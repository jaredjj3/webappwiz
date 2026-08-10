import { beforeEach, describe, expect, it } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as cdk from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { DockerImage } from "./docker-image";
import { Network } from "./network";
import { Service } from "./service";

describe("Service", () => {
	let stack: cdk.Stack;
	let cluster: ecs.Cluster;
	let image: DockerImage;

	beforeEach(() => {
		stack = new cdk.Stack(new cdk.App(), "TestStack", {
			env: { account: "123456789012", region: "us-east-1" },
		});
		const network = new Network(stack, "Network", { maxAzs: 2 });
		cluster = new ecs.Cluster(stack, "Cluster", { vpc: network.vpc });
		cluster.addDefaultCloudMapNamespace({ name: "app.internal" });
		const buildContext = mkdtempSync(join(tmpdir(), "aws-service-"));
		writeFileSync(join(buildContext, "Dockerfile"), "FROM scratch\n");
		image = new DockerImage(stack, "Image", {
			filePath: "Dockerfile",
			buildContext,
			env: { variables: { FOO: "bar" } },
		});
	});

	it("fronts the service with an internal load balancer when asked", () => {
		const service = new Service(stack, "Service", {
			cluster,
			image,
			containerPort: 3000,
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
		const service = new Service(stack, "Service", {
			cluster,
			image,
			containerPort: 3000,
			discoveryName: "api",
		});
		const template = Template.fromStack(stack);

		expect(service.loadBalancer).toBeUndefined();
		template.resourceCountIs("AWS::ElasticLoadBalancingV2::LoadBalancer", 0);
		template.resourceCountIs("AWS::ApplicationAutoScaling::ScalableTarget", 0);
		template.hasResourceProperties("AWS::ServiceDiscovery::Service", {
			Name: "api",
		});
	});

	it("layers runtime environment over the image's build-time variables", () => {
		new Service(stack, "Service", {
			cluster,
			image,
			containerPort: 3000,
			environment: { FOO: "runtime" },
		});
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

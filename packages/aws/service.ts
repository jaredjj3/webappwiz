import { RemovalPolicy } from "aws-cdk-lib";
import type * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as logs from "aws-cdk-lib/aws-logs";
import { Construct } from "constructs";
import type { ServiceImage } from "./docker-image";
import type { Cacheable } from "./domain";

export type ServiceInstance =
	(typeof SERVICE_INSTANCES)[keyof typeof SERVICE_INSTANCES];

// Allowable instance configurations for a service. This makes it impossible to accidentally
// declare an invalid or unexpected instance configuration. Sizes are expressed in Fargate-native
// units (vCPU units and MiB).
export const SERVICE_INSTANCES = {
	MICRO: { cpu: 256, memoryLimitMiB: 512 },
} as const;

export type LoadBalancerOptions = {
	/** Target group health check path. Defaults to '/'. */
	healthCheckPath?: string;
	/** Scale out to at most this many tasks on request count. Omit for a fixed single task. */
	maxCapacity?: number;
	/** Requests per task before scaling out. Defaults to 50. */
	requestsPerTarget?: number;
};

export type ServiceProps = {
	/** Cluster to run on. Several services can share one. */
	cluster: ecs.ICluster;
	image: ServiceImage;
	containerPort: number;
	/** Container name, also the log stream prefix. Defaults to 'app'. */
	containerName?: string;
	/** Defaults to `SERVICE_INSTANCES.MICRO`. */
	instance?: ServiceInstance;
	/** Runtime environment, merged over the image's build-time variables. */
	environment?: Record<string, string>;
	/** Runtime secrets, merged over the image's. */
	secrets?: Record<string, ecs.Secret>;
	/** Container-level health check. An ALB-fronted service is already probed via its target group. */
	healthCheck?: ecs.HealthCheck;
	/** Front the service with an internal ALB. Omit for a service reached only from inside the VPC. */
	loadBalancer?: LoadBalancerOptions;
	/**
	 * Register under this name in the cluster's default Cloud Map namespace, so other services
	 * reach it privately at `<name>.<namespace>:<containerPort>`. The cluster must already have a
	 * namespace (`cluster.addDefaultCloudMapNamespace({ name })`).
	 */
	discoveryName?: string;
};

/**
 * A containerized service on ECS Fargate. With `loadBalancer` it sits behind an *internal*
 * Application Load Balancer, ready to be fronted by a `Domain`'s CloudFront VPC origin; without
 * one it is reachable only from inside the VPC, typically by Cloud Map DNS from another service.
 *
 * Ingress is closed by default — wire it explicitly, e.g.
 * `api.connections.allowFrom(web, ec2.Port.tcp(3000))`.
 */
export class Service extends Construct implements Cacheable, ec2.IConnectable {
	readonly service: ecs.FargateService;
	readonly containerName: string;
	readonly cacheKey: string;
	/** Only set when `loadBalancer` was requested. */
	readonly loadBalancer?: elbv2.ApplicationLoadBalancer;

	constructor(scope: Construct, id: string, props: ServiceProps) {
		super(scope, id);

		this.containerName = props.containerName ?? "app";
		this.cacheKey = props.image.assetHash;

		const logGroup = new logs.LogGroup(this, "LogGroup", {
			retention: logs.RetentionDays.ONE_MONTH,
			removalPolicy: RemovalPolicy.DESTROY,
		});

		const instance = props.instance ?? SERVICE_INSTANCES.MICRO;
		const taskDefinition = new ecs.FargateTaskDefinition(this, "TaskDef", {
			cpu: instance.cpu,
			memoryLimitMiB: instance.memoryLimitMiB,
		});

		taskDefinition.addContainer(this.containerName, {
			image: props.image.containerImage,
			logging: ecs.LogDrivers.awsLogs({
				streamPrefix: this.containerName,
				logGroup,
			}),
			environment: {
				...props.image.environment,
				PORT: String(props.containerPort),
				...props.environment,
			},
			secrets: { ...props.image.secrets, ...props.secrets },
			portMappings: [{ containerPort: props.containerPort }],
			healthCheck: props.healthCheck,
		});

		this.service = new ecs.FargateService(this, "Service", {
			cluster: props.cluster,
			taskDefinition,
			desiredCount: 1,
			// Keep capacity up through deploys (roll a new task in before draining the old).
			minHealthyPercent: 100,
			maxHealthyPercent: 200,
			// Lets ops exec into a running task (prod migrations, a database shell).
			enableExecuteCommand: true,
			cloudMapOptions: props.discoveryName
				? { name: props.discoveryName }
				: undefined,
		});

		if (props.loadBalancer) {
			// Internal ALB — reachable only from within the VPC and from CloudFront's VPC origin. The
			// listener allows 0.0.0.0/0 on port 80, which (being internal) scopes to in-VPC traffic and
			// is what lets the VPC origin connect.
			this.loadBalancer = new elbv2.ApplicationLoadBalancer(
				this,
				"LoadBalancer",
				{ vpc: props.cluster.vpc, internetFacing: false },
			);

			const targetGroup = this.loadBalancer
				.addListener("Listener", { port: 80, open: true })
				.addTargets("Target", {
					protocol: elbv2.ApplicationProtocol.HTTP,
					port: props.containerPort,
					targets: [this.service],
					healthCheck: { path: props.loadBalancer.healthCheckPath ?? "/" },
				});

			if (props.loadBalancer.maxCapacity) {
				this.service
					.autoScaleTaskCount({
						minCapacity: 1,
						maxCapacity: props.loadBalancer.maxCapacity,
					})
					.scaleOnRequestCount("RequestScaling", {
						requestsPerTarget: props.loadBalancer.requestsPerTarget ?? 50,
						targetGroup,
					});
			}
		}
	}

	get connections(): ec2.Connections {
		return this.service.connections;
	}
}

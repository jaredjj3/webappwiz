# @webappwiz/aws

CDK constructs for running a web app on AWS: a `Network` (VPC), a `Database` (private
RDS Postgres), a `Service` (a container on Fargate, optionally behind an internal ALB), a
`Domain` (CloudFront + Route53 + ACM + a rate-limiting WAF in front of an internal ALB),
and the building blocks (`DockerImage`, `SERVICE_INSTANCES`) the services are built from.

This package ships constructs, not a stack. Deploy the shared network once per account and
region from its own CDK app, then look it up by name from each app's CDK app. The network
spans two AZs with public, internet and no-internet subnet tiers. DNS Firewall allowlists
and flow logs are opt-in.

```ts
import * as cdk from "aws-cdk-lib";
import { Network } from "@webappwiz/aws";
import type { Construct } from "constructs";

// In the network CDK app. Deploy this before synthesizing the app stacks.
export class NetworkStack extends cdk.Stack {
	constructor(scope: Construct, id: string) {
		super(scope, id);

		new Network(this, "Network", { name: "shared", cidr: "10.0.0.0/16" });
	}
}
```

`cdk synth` fails with the requested network name when no VPC has that tag. The lookup is
cached in the app's `cdk.context.json`; remove that file to look up a changed network again.

## Permanent staging and prod

Keep both stages in the same CDK app and AWS account. They share the network and prod's
hosted zone, but each stage creates its own cluster, database and secret, security groups,
services and CloudFront distributions. Instantiate one stack class twice so infrastructure
changes reach staging first without a separate implementation that can drift.

```ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as route53 from "aws-cdk-lib/aws-route53";
import {
	Database,
	DockerImage,
	Domain,
	Network,
	SERVICE_INSTANCES,
	Service,
	type ServiceInstance,
} from "@webappwiz/aws";
import type { Construct } from "constructs";

type AppStackProps = cdk.StackProps & {
	domainName: string;
	hostedZone: route53.IHostedZone;
	instance: ServiceInstance;
	maxCapacity: number;
};

class AppStack extends cdk.Stack {
	constructor(scope: Construct, id: string, props: AppStackProps) {
		super(scope, id, props);

		const network = Network.lookup(this, "Network", { name: "shared" });
		const database = new Database(this, "Database", {
			vpc: network.vpc,
			databaseName: "app",
			// These are the defaults too: permanent staging matches prod's data protection.
			deletionProtection: true,
			removalPolicy: cdk.RemovalPolicy.RETAIN,
		});

		const cluster = new ecs.Cluster(this, "Cluster", { vpc: network.vpc });
		cluster.addDefaultCloudMapNamespace({ name: "app.internal" });

		const web = new Service(this, "Web", {
			cluster,
			image: new DockerImage(this, "WebImage", { filePath, buildContext }),
			containerPort: 3000,
			instance: props.instance,
			loadBalancer: { maxCapacity: props.maxCapacity },
		});

		const api = new Service(this, "Api", {
			cluster,
			image: new DockerImage(this, "ApiImage", { filePath, buildContext }),
			containerPort: 3000,
			containerName: "api",
			instance: props.instance,
			subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
			discoveryName: "api",
			secrets: { DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret, "password") },
		});
		api.connections.allowFrom(web, ec2.Port.tcp(3000), "web to api");
		database.instance.connections.allowDefaultPortFrom(api, "api to postgres");

		const domain = new Domain(this, "Domain", {
			// biome-ignore lint/style/noNonNullAssertion: this service has a load balancer
			originLoadBalancer: web.loadBalancer!,
			domainName: props.domainName,
			hostedZone: props.hostedZone,
		});
		domain.invalidateOnUpdate(web);
	}
}

type AppStageProps = cdk.StageProps &
	Omit<AppStackProps, keyof cdk.StackProps> & {
		appName: string;
		stageName: string;
	};

class AppStage extends cdk.Stage {
	constructor(scope: Construct, id: string, props: AppStageProps) {
		super(scope, id, props);

		new AppStack(this, "App", props);
		cdk.Tags.of(this).add("app", props.appName);
		cdk.Tags.of(this).add("stage", props.stageName);
	}
}

const app = new cdk.App();
const env = { account: "123456789012", region: "us-east-1" };
// Create and delegate this prod zone before deploying either stage, then use its real ID.
const prodHostedZone = route53.HostedZone.fromHostedZoneAttributes(
	app,
	"ProdHostedZone",
	{ hostedZoneId: "Z0123456789ABCDEFGHIJ", zoneName: "example.com" },
);

new AppStage(app, "Staging", {
	env,
	appName: "my-app",
	stageName: "staging",
	domainName: "staging.example.com",
	hostedZone: prodHostedZone,
	instance: SERVICE_INSTANCES.MICRO,
	maxCapacity: 2,
});
new AppStage(app, "Prod", {
	env,
	appName: "my-app",
	stageName: "prod",
	domainName: "example.com",
	hostedZone: prodHostedZone,
	instance: SERVICE_INSTANCES.MICRO,
	maxCapacity: 10,
});
```

`Domain` creates a hosted zone for `domainName` when `hostedZone` is omitted. Pass an
existing zone as above for staging: its `staging.example.com` and `www.staging.example.com`
records go into prod's zone instead of creating a zone that needs separate delegation.
The zone must contain `domainName`.

Deploy `Staging/App` on every merge, then inspect it and deploy `Prod/App` by hand. Avoid
console changes in either stage. Activate the `app` and `stage` user-defined cost allocation
tags in the AWS Billing and Cost Management console to split costs by app and environment;
CDK applies them to every taggable resource in each stage. The separately deployed shared
network is billed to the account rather than to one app's stage.

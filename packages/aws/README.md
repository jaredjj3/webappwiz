# @webappwiz/aws

CDK constructs for running a web app on AWS: a `Network` (VPC), a `Database` (private
RDS Postgres), a `Service` (a container on Fargate, optionally behind an internal ALB), a
`Domain` (CloudFront + Route53 + ACM + a rate-limiting WAF in front of an internal ALB),
and the building blocks (`DockerImage`, `SERVICE_INSTANCES`) the services are built from.

This package ships constructs, not a stack. Each app composes them into its own.

```ts
import * as cdk from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import { Network, Database, DockerImage, Domain, Service } from "@webappwiz/aws";

export class Stack extends cdk.Stack {
	constructor(scope: Construct, id: string) {
		super(scope, id);

		const network = new Network(this, "Network", { maxAzs: 2 });
		const database = new Database(this, "Database", { vpc: network.vpc, databaseName: "app" });

		const cluster = new ecs.Cluster(this, "Cluster", { vpc: network.vpc });
		cluster.addDefaultCloudMapNamespace({ name: "app.internal" });

		// Public-facing web service, behind an internal ALB.
		const web = new Service(this, "Web", {
			cluster,
			image: new DockerImage(this, "WebImage", { filePath, buildContext }),
			containerPort: 3000,
			loadBalancer: { maxCapacity: 2 },
		});

		// Private api, reached at api.app.internal:3000 by the web service alone.
		const api = new Service(this, "Api", {
			cluster,
			image: new DockerImage(this, "ApiImage", { filePath, buildContext }),
			containerPort: 3000,
			containerName: "api",
			discoveryName: "api",
			secrets: { DB_PASSWORD: ecs.Secret.fromSecretsManager(database.secret, "password") },
		});
		api.connections.allowFrom(web, ec2.Port.tcp(3000), "web to api");
		database.instance.connections.allowDefaultPortFrom(api, "api to postgres");

		const domain = new Domain(this, "Domain", {
			// biome-ignore lint/style/noNonNullAssertion: this service has a load balancer
			originLoadBalancer: web.loadBalancer!,
			domainName: "example.com",
			redirectDomains: [{ domainName: "example.net" }],
		});
		domain.invalidateOnUpdate(web);
	}
}
```

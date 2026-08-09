# @webappwiz/aws

CDK constructs for running a web app on AWS: a `Network` (VPC), a `Database` (private
RDS Postgres), a `Domain` (CloudFront + Route53 + ACM + a rate-limiting WAF in front of
an internal ALB), and the building blocks (`DockerImage`, `SERVICE_INSTANCES`) other
constructs use to run a container on Fargate.

This package ships constructs, not a stack — each app composes them into its own.

```ts
import * as cdk from "aws-cdk-lib";
import { Network, Database, Domain } from "@webappwiz/aws";

export class Stack extends cdk.Stack {
	constructor(scope: Construct, id: string) {
		super(scope, id);

		const network = new Network(this, "Network", { maxAzs: 2 });
		const database = new Database(this, "Database", { vpc: network.vpc, databaseName: "app" });
		// ...build a Fargate service behind an ALB, then front it:
		const domain = new Domain(this, "Domain", {
			originLoadBalancer: web.loadBalancer,
			domainName: "example.com",
			redirectDomains: [{ domainName: "example.net" }],
		});
	}
}
```

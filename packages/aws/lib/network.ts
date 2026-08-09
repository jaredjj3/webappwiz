import * as ec2 from "aws-cdk-lib/aws-ec2";
import { Construct } from "constructs";

export type NetworkProps = {
	/**
	 * Number of availability zones to span. Defaults to 1. An ALB-fronted service needs at least 2;
	 * a VPC-connector service (App Runner) only needs 1.
	 */
	maxAzs?: number;
};

export class Network extends Construct {
	readonly vpc: ec2.Vpc;

	constructor(scope: Construct, id: string, props: NetworkProps = {}) {
		super(scope, id);

		this.vpc = new ec2.Vpc(this, "VPC", {
			maxAzs: props.maxAzs ?? 1,
			// A single NAT gateway serves all AZs, keeping egress costs down.
			natGateways: 1,
		});
	}
}

import { Duration, RemovalPolicy } from "aws-cdk-lib";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as rds from "aws-cdk-lib/aws-rds";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export type DatabaseProps = {
	vpc: ec2.IVpc;
	/** Name of the database and of the master user. */
	databaseName: string;
	/** Defaults to a single small burstable instance. Bump when load warrants it. */
	instanceType?: ec2.InstanceType;
	multiAz?: boolean;
	/** Defaults to 20 (GiB). */
	allocatedStorage?: number;
	/** Defaults to 7 days. */
	backupRetention?: Duration;
	deletionProtection?: boolean;
	removalPolicy?: RemovalPolicy;
};

/**
 * RDS Postgres for an internal service. Not publicly accessible, reachable only from
 * whatever security group the caller wires up (e.g. an api task's).
 */
export class Database extends Construct {
	readonly instance: rds.DatabaseInstance;
	readonly secret: secretsmanager.ISecret;
	readonly databaseName: string;

	constructor(scope: Construct, id: string, props: DatabaseProps) {
		super(scope, id);

		this.databaseName = props.databaseName;

		this.instance = new rds.DatabaseInstance(this, "Instance", {
			engine: rds.DatabaseInstanceEngine.postgres({
				version: rds.PostgresEngineVersion.VER_16,
			}),
			vpc: props.vpc,
			// The VPC has no isolated subnets; private-with-egress plus a strict
			// security group (wired by the caller) keeps the database off the internet.
			vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
			instanceType:
				props.instanceType ??
				ec2.InstanceType.of(
					ec2.InstanceClass.BURSTABLE4_GRAVITON,
					ec2.InstanceSize.MICRO,
				),
			allocatedStorage: props.allocatedStorage ?? 20,
			storageType: rds.StorageType.GP3,
			storageEncrypted: true,
			databaseName: props.databaseName,
			credentials: rds.Credentials.fromGeneratedSecret(props.databaseName),
			multiAz: props.multiAz ?? false,
			backupRetention: props.backupRetention ?? Duration.days(7),
			deletionProtection: props.deletionProtection ?? true,
			removalPolicy: props.removalPolicy ?? RemovalPolicy.RETAIN,
		});

		if (!this.instance.secret) {
			throw new Error("expected RDS to generate a credentials secret");
		}
		this.secret = this.instance.secret;
	}
}

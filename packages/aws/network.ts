import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as route53resolver from "aws-cdk-lib/aws-route53resolver";
import { Construct } from "constructs";

export type NetworkProps = {
	/** Value of the VPC's Name tag, used by Network.lookup. */
	name: string;
	/** CIDR range for the VPC. */
	cidr: string;
	/** Allow only these DNS domains, blocking every other DNS query in the VPC. */
	dnsFirewall?: { allowedDomains: string[] };
	/** Defaults to false. */
	flowLogs?: boolean;
};

export type NetworkLookupProps = {
	/** Value of the VPC's Name tag. */
	name: string;
};

export class Network extends Construct {
	readonly vpc: ec2.IVpc;

	static lookup(
		scope: Construct,
		id: string,
		props: NetworkLookupProps,
	): Pick<Network, "vpc"> {
		return {
			vpc: ec2.Vpc.fromLookup(scope, id, { tags: { Name: props.name } }),
		};
	}

	constructor(scope: Construct, id: string, props: NetworkProps) {
		super(scope, id);

		this.vpc = new ec2.Vpc(this, "VPC", {
			vpcName: props.name,
			ipAddresses: ec2.IpAddresses.cidr(props.cidr),
			maxAzs: 2,
			natGateways: 1,
			subnetConfiguration: [
				{ name: "public", subnetType: ec2.SubnetType.PUBLIC, cidrMask: 24 },
				{
					name: "internet",
					subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS,
					cidrMask: 24,
				},
				{
					name: "no-internet",
					subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
					cidrMask: 24,
				},
			],
			gatewayEndpoints: {
				S3: { service: ec2.GatewayVpcEndpointAwsService.S3 },
				DynamoDB: { service: ec2.GatewayVpcEndpointAwsService.DYNAMODB },
			},
			flowLogs: props.flowLogs ? { FlowLog: {} } : undefined,
		});

		const interfaceEndpoints = {
			EcrApi: ec2.InterfaceVpcEndpointAwsService.ECR,
			EcrDocker: ec2.InterfaceVpcEndpointAwsService.ECR_DOCKER,
			CloudWatchLogs: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_LOGS,
			SecretsManager: ec2.InterfaceVpcEndpointAwsService.SECRETS_MANAGER,
			Ssm: ec2.InterfaceVpcEndpointAwsService.SSM,
			SsmMessages: ec2.InterfaceVpcEndpointAwsService.SSM_MESSAGES,
		};
		for (const [id, service] of Object.entries(interfaceEndpoints)) {
			this.vpc.addInterfaceEndpoint(id, {
				service,
				subnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_EGRESS },
			});
		}

		if (props.dnsFirewall) {
			this.addDnsFirewall(props.name, props.dnsFirewall.allowedDomains);
		}
	}

	private addDnsFirewall(name: string, allowedDomains: string[]): void {
		const domainList = new route53resolver.CfnFirewallDomainList(
			this,
			"AllowedDomains",
			{ name: `${name}-allowed-domains`, domains: allowedDomains },
		);
		const ruleGroup = new route53resolver.CfnFirewallRuleGroup(
			this,
			"DnsFirewall",
			{
				name: `${name}-dns-allowlist`,
				firewallRules: [
					{
						action: "ALLOW",
						priority: 100,
						firewallDomainListId: domainList.attrId,
					},
					{ action: "BLOCK", blockResponse: "NODATA", priority: 200 },
				],
			},
		);
		new route53resolver.CfnFirewallRuleGroupAssociation(
			this,
			"DnsFirewallAssociation",
			{
				name: `${name}-dns-allowlist`,
				priority: 100,
				firewallRuleGroupId: ruleGroup.attrId,
				vpcId: this.vpc.vpcId,
			},
		);
	}
}

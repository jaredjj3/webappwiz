import { Duration, Stack } from "aws-cdk-lib";
import * as certificateManager from "aws-cdk-lib/aws-certificatemanager";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import type * as elbv2 from "aws-cdk-lib/aws-elasticloadbalancingv2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from "aws-cdk-lib/aws-route53";
import * as route53Targets from "aws-cdk-lib/aws-route53-targets";
import * as wafv2 from "aws-cdk-lib/aws-wafv2";
import {
	AwsCustomResource,
	AwsCustomResourcePolicy,
	PhysicalResourceId,
} from "aws-cdk-lib/custom-resources";
import { Construct, type IConstruct } from "constructs";

export type RedirectDomain = {
	/** Root domain to provision a hosted zone for, e.g. 'example.net'. */
	domainName: string;
	/** Also redirect the www subdomain. Defaults to true. */
	includeWww?: boolean;
};

export type DomainProps = {
	/**
	 * Internal ALB the apex distribution serves from, reached privately via a CloudFront VPC origin
	 * (plain HTTP, since the hop stays on AWS's network).
	 */
	originLoadBalancer: elbv2.IApplicationLoadBalancer;
	/** Apex domain the app is served from, e.g. 'example.com'. Gets its own hosted zone. */
	domainName: string;
	/** Redirect www.domainName to domainName. Defaults to true. */
	includeWww?: boolean;
	/** Other domains that should redirect to `domainName` rather than serve the app themselves. */
	redirectDomains?: RedirectDomain[];
	/** Requests per IP per 5-minute window before the edge WAF starts blocking the client. Defaults to 2000. */
	rateLimitPerIp?: number;
};

/**
 * An origin whose served content is versioned by a cache key. The key must
 * change whenever the content changes, so a cache can be invalidated exactly
 * once per update.
 */
export interface Cacheable extends IConstruct {
	readonly cacheKey: string;
}

function zoneIdFor(domainName: string): string {
	return `HostedZone-${domainName.replace(/[^a-zA-Z0-9]/g, "-")}`;
}

/**
 * A domain served from an internal ALB via a CloudFront VPC origin (the ALB is never exposed to
 * the public internet), with an edge WAF rate limit and an optional set of other domains that
 * redirect to it.
 */
export class Domain extends Construct {
	readonly hostedZone: route53.HostedZone;
	readonly certificate: certificateManager.Certificate;
	readonly distribution: cloudfront.Distribution;
	readonly redirectDistribution?: cloudfront.Distribution;

	constructor(scope: Construct, id: string, props: DomainProps) {
		super(scope, id);

		const includeWww = props.includeWww ?? true;
		const redirectDomains = props.redirectDomains ?? [];

		this.hostedZone = new route53.HostedZone(
			this,
			zoneIdFor(props.domainName),
			{
				zoneName: props.domainName,
			},
		);

		const redirectZones = redirectDomains.map((redirect) => ({
			...redirect,
			includeWww: redirect.includeWww ?? true,
			hostedZone: new route53.HostedZone(this, zoneIdFor(redirect.domainName), {
				zoneName: redirect.domainName,
			}),
		}));

		// Every hostname other than the apex, each mapped to the hosted zone that owns it. Needed
		// both for certificate DNS validation and for the redirect distribution's alternate names.
		const redirectNames: Array<{ name: string; zone: route53.HostedZone }> = [];
		if (includeWww) {
			redirectNames.push({
				name: `www.${props.domainName}`,
				zone: this.hostedZone,
			});
		}
		for (const redirect of redirectZones) {
			redirectNames.push({
				name: redirect.domainName,
				zone: redirect.hostedZone,
			});
			if (redirect.includeWww) {
				redirectNames.push({
					name: `www.${redirect.domainName}`,
					zone: redirect.hostedZone,
				});
			}
		}

		this.certificate = new certificateManager.Certificate(this, "Certificate", {
			domainName: props.domainName,
			validation: certificateManager.CertificateValidation.fromDnsMultiZone({
				[props.domainName]: this.hostedZone,
				...Object.fromEntries(
					redirectNames.map(({ name, zone }) => [name, zone]),
				),
			}),
			subjectAlternativeNames: redirectNames.map(({ name }) => name),
		});

		const cachePolicy = new cloudfront.CachePolicy(this, "CachePolicy", {
			// Allowlist model: a response is edge-cached only when the origin opts in with a
			// Cache-Control max-age (e.g. static assets). A defaultTtl of 0 means responses with no
			// cache headers (typically per-user SSR HTML) are never cached, so one visitor's page
			// can never be served to another. min/maxTtl still bound the opt-ins.
			minTtl: Duration.seconds(0),
			defaultTtl: Duration.seconds(0),
			maxTtl: Duration.days(365),
			queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
			enableAcceptEncodingGzip: true,
			enableAcceptEncodingBrotli: true,
		});

		// Per-IP rate limit, enforced at the edge before requests reach the origin. The scope must be
		// CLOUDFRONT and the WebACL must live in us-east-1. Both hold here, since the plain ACM
		// certificate above already pins this whole stack to us-east-1. Blocks (not just counts) any
		// IP exceeding the threshold. WAF counts every viewer request per IP, cached static assets
		// included, so the limit should sit well above an active human session.
		const webAcl = new wafv2.CfnWebACL(this, "WebAcl", {
			scope: "CLOUDFRONT",
			defaultAction: { allow: {} },
			visibilityConfig: {
				cloudWatchMetricsEnabled: true,
				metricName: `${props.domainName.replace(/[^a-zA-Z0-9]/g, "-")}-waf`,
				sampledRequestsEnabled: true,
			},
			rules: [
				{
					name: "RateLimitPerIp",
					priority: 0,
					action: { block: {} },
					statement: {
						rateBasedStatement: {
							limit: props.rateLimitPerIp ?? 2000,
							evaluationWindowSec: 300,
							aggregateKeyType: "IP",
						},
					},
					visibilityConfig: {
						cloudWatchMetricsEnabled: true,
						metricName: "RateLimitPerIp",
						sampledRequestsEnabled: true,
					},
				},
			],
		});

		this.distribution = new cloudfront.Distribution(
			this,
			"CloudFrontDistribution",
			{
				defaultBehavior: {
					origin: origins.VpcOrigin.withApplicationLoadBalancer(
						props.originLoadBalancer,
						{
							protocolPolicy: cloudfront.OriginProtocolPolicy.HTTP_ONLY,
							httpPort: 80,
						},
					),
					viewerProtocolPolicy:
						cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
					allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
					cachePolicy,
					originRequestPolicy:
						cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
				},
				// Only the apex distribution fronts the origin and so carries the rate limit. The redirect
				// distribution below just bounces traffic to the apex and never touches the origin.
				webAclId: webAcl.attrArn,
				domainNames: [props.domainName],
				certificate: this.certificate,
				comment: `${props.domainName}: serves the application from the origin.`,
			},
		);

		new route53.ARecord(this, "AliasRecord", {
			zone: this.hostedZone,
			target: route53.RecordTarget.fromAlias(
				new route53Targets.CloudFrontTarget(this.distribution),
			),
		});

		if (redirectNames.length > 0) {
			const redirectFunction = new cloudfront.Function(
				this,
				"RedirectFunction",
				{
					code: cloudfront.FunctionCode.fromInline(`
					function handler(event) {
						var request = event.request;
						var response = {
							statusCode: 301,
							statusDescription: "Moved Permanently",
							headers: { "location": { "value": "https://${props.domainName}" + request.uri } }
						};
						return response;
					}
				`),
				},
			);

			this.redirectDistribution = new cloudfront.Distribution(
				this,
				"RedirectDistribution",
				{
					defaultBehavior: {
						origin: new origins.HttpOrigin(props.domainName),
						viewerProtocolPolicy:
							cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
						functionAssociations: [
							{
								eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
								function: redirectFunction,
							},
						],
					},
					domainNames: redirectNames.map(({ name }) => name),
					certificate: this.certificate,
					comment: `Redirects ${redirectNames.map(({ name }) => name).join(", ")} to ${props.domainName}.`,
				},
			);

			for (const { name, zone } of redirectNames) {
				const recordName =
					name === zone.zoneName
						? undefined
						: name.replace(`.${zone.zoneName}`, "");
				new route53.ARecord(
					this,
					`AliasRecord-${name.replace(/[^a-zA-Z0-9]/g, "-")}`,
					{
						zone,
						recordName,
						target: route53.RecordTarget.fromAlias(
							new route53Targets.CloudFrontTarget(this.redirectDistribution),
						),
					},
				);
			}
		}
	}

	/**
	 * Invalidates the entire cache (`/*`) whenever `origin`'s content changes.
	 * The distribution is also ordered after `origin`, so the invalidation runs
	 * once the new content is live. Re-invalidates only when `origin.cacheKey`
	 * changes, and no-ops otherwise.
	 */
	invalidateOnUpdate(origin: Cacheable): void {
		this.distribution.node.addDependency(origin);

		new AwsCustomResource(this, "CacheInvalidation", {
			onUpdate: {
				service: "CloudFront",
				action: "createInvalidation",
				parameters: {
					DistributionId: this.distribution.distributionId,
					InvalidationBatch: {
						CallerReference: origin.cacheKey,
						Paths: { Quantity: 1, Items: ["/*"] },
					},
				},
				physicalResourceId: PhysicalResourceId.of(origin.cacheKey),
			},
			policy: AwsCustomResourcePolicy.fromStatements([
				new iam.PolicyStatement({
					actions: ["cloudfront:CreateInvalidation"],
					resources: [
						`arn:aws:cloudfront::${Stack.of(this).account}:distribution/${this.distribution.distributionId}`,
					],
				}),
			]),
		});
	}
}

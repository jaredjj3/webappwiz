import type * as ecr from "aws-cdk-lib/aws-ecr";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";
import type { ServiceImage } from "./docker-image";

export type EcrImageProps = {
	/** Existing ECR repository containing the image. */
	repository: ecr.IRepository;
	/** Full image digest, such as `sha256:...`; mutable tags are not accepted. */
	digest: string;
	env?: Env;
};

type Env = {
	variables?: Record<string, string>;
	secrets?: Record<string, secretsmanager.ISecret>;
};

/** An immutable image already built and pushed to ECR. */
export class EcrImage extends Construct implements ServiceImage {
	private readonly repository: ecr.IRepository;
	private readonly digest: string;
	private readonly env: Env;

	constructor(scope: Construct, id: string, props: EcrImageProps) {
		super(scope, id);

		if (!/^sha256:[0-9a-f]{64}$/.test(props.digest)) {
			throw new Error("EcrImage requires a full sha256 digest");
		}
		this.repository = props.repository;
		this.digest = props.digest;
		this.env = props.env ?? {};
	}

	get assetHash(): string {
		return this.digest;
	}

	get containerImage(): ecs.ContainerImage {
		return ecs.ContainerImage.fromEcrRepository(this.repository, this.digest);
	}

	get environment(): Record<string, string> {
		return { ...this.env.variables };
	}

	get secrets(): Record<string, ecs.Secret> {
		const result: Record<string, ecs.Secret> = {};
		for (const [key, secret] of Object.entries(this.env.secrets ?? {})) {
			result[key] = ecs.Secret.fromSecretsManager(secret);
		}
		return result;
	}
}

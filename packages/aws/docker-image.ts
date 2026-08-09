import { DockerImageAsset, Platform } from "aws-cdk-lib/aws-ecr-assets";
import * as ecs from "aws-cdk-lib/aws-ecs";
import type * as secretsmanager from "aws-cdk-lib/aws-secretsmanager";
import { Construct } from "constructs";

export type DockerImageProps = {
	filePath: string;
	buildContext: string;
	buildArgs?: Record<string, string>;
	env?: Env;
};

type Env = {
	variables?: Record<string, string>;
	secrets?: Record<string, secretsmanager.ISecret>;
};

export class DockerImage extends Construct {
	private readonly asset: DockerImageAsset;
	private readonly env: Env;

	constructor(scope: Construct, id: string, props: DockerImageProps) {
		super(scope, id);

		this.asset = new DockerImageAsset(this, "Asset", {
			file: props.filePath,
			directory: props.buildContext,
			platform: Platform.LINUX_AMD64,
			buildArgs: props.buildArgs,
		});

		this.env = props.env ?? {};
	}

	/**
	 * A content hash of the built image. Changes whenever the image changes,
	 * making it a stable cache key for the content this image serves.
	 */
	get assetHash(): string {
		return this.asset.assetHash;
	}

	/** The image as an ECS container image, ready for a Fargate task definition. */
	get containerImage(): ecs.ContainerImage {
		return ecs.ContainerImage.fromDockerImageAsset(this.asset);
	}

	/** Plain environment variables to inject into the container at runtime. */
	get environment(): Record<string, string> {
		return { ...this.env.variables };
	}

	/** Secrets to inject into the container at runtime, as ECS-sourced secrets. */
	get secrets(): Record<string, ecs.Secret> {
		const result: Record<string, ecs.Secret> = {};
		for (const [key, secret] of Object.entries(this.env.secrets ?? {})) {
			result[key] = ecs.Secret.fromSecretsManager(secret);
		}
		return result;
	}
}

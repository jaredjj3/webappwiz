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

// rule-ignore one-dir-per-interface: apps composing this package supply their own
// images, so the contract is the point even with one implementation shipped here
/** What a service needs from an image: how to run it, and what to run it with. */
export interface ServiceImage {
	/** A content hash of the built image, stable while the image is unchanged. */
	readonly assetHash: string;
	/** The image as an ECS container image, ready for a Fargate task definition. */
	readonly containerImage: ecs.ContainerImage;
	/** Plain environment variables to inject into the container at runtime. */
	readonly environment: Record<string, string>;
	/** Secrets to inject into the container at runtime, as ECS-sourced secrets. */
	readonly secrets: Record<string, ecs.Secret>;
}

export class DockerImage extends Construct implements ServiceImage {
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

	get containerImage(): ecs.ContainerImage {
		return ecs.ContainerImage.fromDockerImageAsset(this.asset);
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

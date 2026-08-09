export type ServiceInstance =
	(typeof SERVICE_INSTANCES)[keyof typeof SERVICE_INSTANCES];

// Allowable instance configurations for a service. This makes it impossible to accidentally
// declare an invalid or unexpected instance configuration. Sizes are expressed in Fargate-native
// units (vCPU units and MiB).
export const SERVICE_INSTANCES = {
	MICRO: { cpu: 256, memoryLimitMiB: 512 },
} as const;

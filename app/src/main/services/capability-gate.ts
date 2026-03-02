import type { RuntimeCapabilityReport } from './runtime';
import type { RuntimeContext } from './runtime-context';

export interface CapabilityCheckResult {
  readonly allowed: boolean;
  readonly reasons: string[];
  readonly capability: RuntimeCapabilityReport;
}

export class CapabilityGate {
  evaluate(context: RuntimeContext, capability: RuntimeCapabilityReport): CapabilityCheckResult {
    const reasons: string[] = [];

    if (!capability.supportedPermissionModes.includes(context.permissionMode)) {
      reasons.push(
        `Runtime "${context.runtime}" does not support permission mode "${context.permissionMode}"`,
      );
    }

    return {
      allowed: reasons.length === 0,
      reasons,
      capability,
    };
  }
}

export const capabilityGate = new CapabilityGate();

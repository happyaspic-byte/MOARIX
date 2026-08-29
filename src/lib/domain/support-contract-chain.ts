export const supportContractScopes = ["customer_support", "partner_support", "vendor_support"] as const;
export type SupportContractScope = (typeof supportContractScopes)[number];

const TIER: Record<SupportContractScope, number> = {
  customer_support: 1,
  partner_support: 2,
  vendor_support: 3,
};

export function supportContractTier(scope: SupportContractScope) {
  return TIER[scope];
}

export function buildSupportContractChain<T extends { scope: string; providerName?: string; recipientName?: string }>(
  contracts: T[],
) {
  return contracts
    .filter((contract): contract is T & { scope: SupportContractScope } =>
      supportContractScopes.includes(contract.scope as SupportContractScope),
    )
    .map((contract) => ({ ...contract, tier: TIER[contract.scope] }))
    .sort((left, right) => left.tier - right.tier);
}

export function nextRevisionNumber(revisions: Array<{ revisionNumber: number }>) {
  return revisions.reduce((max, revision) => Math.max(max, revision.revisionNumber), 0) + 1;
}

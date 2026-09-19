/** Composio uses comment polling; interactive triggers require signed webhooks. */
export function unsupportedComposioFeatures(provider: string, campaign: {
  dmTriggerEnabled?: boolean; openingDmEnabled?: boolean;
  requireFollow?: boolean; followUpEnabled?: boolean;
}): boolean {
  return provider === "COMPOSIO" && Boolean(campaign.dmTriggerEnabled ||
    campaign.openingDmEnabled || campaign.requireFollow || campaign.followUpEnabled);
}

export function commentAfterActivation(timestamp: string | undefined, activatedAt: Date | null, createdAt: Date): boolean {
  return Boolean(timestamp && Date.parse(timestamp) >= (activatedAt ?? createdAt).getTime());
}

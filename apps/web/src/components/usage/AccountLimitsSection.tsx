import type { ServerProviderAccountLimitWindow } from "@t3tools/contracts";

import type { CodexAccountLimitsView } from "../../state/accountLimits";
import { Card } from "../ui/card";

export function formatLimitWindowLabel(durationMinutes: number | undefined): string {
  if (durationMinutes === 10_080) return "Weekly limit";
  if (durationMinutes === undefined) return "Usage limit";
  if (durationMinutes % 1_440 === 0) return `${durationMinutes / 1_440}-day limit`;
  if (durationMinutes % 60 === 0) return `${durationMinutes / 60}-hour limit`;
  return `${durationMinutes}-minute limit`;
}

export function availablePercent(usedPercent: number): number {
  return Math.min(100, Math.max(0, 100 - usedPercent));
}

export function formatResetLabel(resetsAt: string | undefined, nowMs = Date.now()): string | null {
  if (resetsAt === undefined) return null;
  const resetMs = Date.parse(resetsAt);
  if (Number.isNaN(resetMs)) return null;
  const remainingMinutes = Math.floor((resetMs - nowMs) / 60_000);
  if (remainingMinutes <= 0) return "Reset due";
  const days = Math.floor(remainingMinutes / 1_440);
  const hours = Math.floor((remainingMinutes % 1_440) / 60);
  const minutes = remainingMinutes % 60;
  if (days > 0) return `Resets in ${days}d ${hours}h`;
  if (hours > 0) return `Resets in ${hours}h ${minutes}m`;
  return `Resets in ${minutes}m`;
}

function LimitWindow({ window }: { readonly window: ServerProviderAccountLimitWindow }) {
  const resetLabel = formatResetLabel(window.resetsAt);
  const available = availablePercent(window.usedPercent);
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-sm text-foreground">
          {formatLimitWindowLabel(window.windowDurationMinutes)}
        </span>
        <span className="text-sm font-medium text-foreground tabular-nums">
          {available}% available
        </span>
      </div>
      <div
        className="h-1.5 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-label={`${formatLimitWindowLabel(window.windowDurationMinutes)} available`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={available}
      >
        <div className="h-full rounded-full bg-foreground/70" style={{ width: `${available}%` }} />
      </div>
      {resetLabel ? <span className="text-xs text-muted-foreground">{resetLabel}</span> : null}
    </div>
  );
}

export function AccountLimitsSection({
  accounts,
}: {
  readonly accounts: ReadonlyArray<CodexAccountLimitsView>;
}) {
  if (accounts.length === 0) return null;

  return (
    <section className="grid gap-3" aria-labelledby="account-limits-heading">
      <div className="grid gap-1">
        <h2 id="account-limits-heading" className="text-sm font-semibold text-foreground">
          Account limits
        </h2>
        <p className="text-xs text-muted-foreground">
          Current subscription usage reported by Codex.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {accounts.map((account) => (
          <Card
            key={`${account.environmentId}:${account.instanceId}`}
            className="gap-5 p-5 shadow-none"
          >
            <div className="grid gap-1">
              <div className="flex min-w-0 items-baseline justify-between gap-3">
                <h3 className="truncate text-sm font-medium text-foreground">
                  {account.providerLabel}
                </h3>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {account.environmentLabel}
                </span>
              </div>
              {account.accountLabel ? (
                <span className="truncate text-xs text-muted-foreground">
                  {account.accountLabel}
                </span>
              ) : null}
            </div>
            <div className="grid gap-5">
              {account.accountLimits.windows.map((window) => (
                <LimitWindow key={window.kind} window={window} />
              ))}
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

import { useAtomValue } from "@effect/atom-react";
import type {
  EnvironmentId,
  ProviderInstanceId,
  ServerProvider,
  ServerProviderAccountLimits,
} from "@t3tools/contracts";
import { useCallback, useMemo } from "react";

import { environmentPresentations } from "./presentation";
import { serverEnvironment } from "./server";
import { useAtomCommand } from "./use-atom-command";

interface AccountLimitsEnvironment {
  readonly label: string;
  readonly providers: ReadonlyArray<ServerProvider>;
}

export interface CodexAccountLimitsView {
  readonly environmentId: EnvironmentId;
  readonly environmentLabel: string;
  readonly instanceId: ProviderInstanceId;
  readonly providerLabel: string;
  readonly accountLabel: string | null;
  readonly accountLimits: ServerProviderAccountLimits;
}

export function selectCodexAccountLimits(
  environments: ReadonlyMap<EnvironmentId, AccountLimitsEnvironment>,
): ReadonlyArray<CodexAccountLimitsView> {
  const selected: CodexAccountLimitsView[] = [];
  for (const [environmentId, environment] of environments) {
    for (const provider of environment.providers) {
      if (provider.driver !== "codex" || provider.accountLimits === undefined) {
        continue;
      }
      selected.push({
        environmentId,
        environmentLabel: environment.label,
        instanceId: provider.instanceId,
        providerLabel: provider.displayName ?? "Codex",
        accountLabel: provider.auth.email ?? provider.auth.label ?? null,
        accountLimits: provider.accountLimits,
      });
    }
  }
  return selected;
}

export function useCodexAccountLimits() {
  const presentations = useAtomValue(environmentPresentations.presentationsAtom);
  const refreshProviders = useAtomCommand(serverEnvironment.refreshProviders, {
    reportFailure: false,
  });
  const accounts = useMemo(() => {
    const environments = new Map<EnvironmentId, AccountLimitsEnvironment>();
    for (const [environmentId, presentation] of presentations) {
      environments.set(environmentId, {
        label: presentation.entry.target.label,
        providers: presentation.serverConfig?.providers ?? [],
      });
    }
    return selectCodexAccountLimits(environments);
  }, [presentations]);
  const refresh = useCallback(() => {
    void Promise.all(
      [...presentations.keys()].map((environmentId) =>
        refreshProviders({ environmentId, input: {} }),
      ),
    );
  }, [presentations, refreshProviders]);

  return { accounts, refresh };
}

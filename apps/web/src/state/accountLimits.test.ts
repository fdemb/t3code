import {
  EnvironmentId,
  ProviderDriverKind,
  ProviderInstanceId,
  type ServerProvider,
} from "@t3tools/contracts";
import { describe, expect, it } from "vite-plus/test";

import { selectCodexAccountLimits } from "./accountLimits";

const provider = (instanceId: string): ServerProvider => ({
  instanceId: ProviderInstanceId.make(instanceId),
  driver: ProviderDriverKind.make("codex"),
  displayName: "Codex",
  enabled: true,
  installed: true,
  version: "1.0.0",
  status: "ready",
  auth: { status: "authenticated", email: "filip@example.com" },
  checkedAt: "2026-04-10T00:00:00.000Z",
  models: [],
  slashCommands: [],
  skills: [],
  accountLimits: {
    observedAt: "2026-04-10T00:00:00.000Z",
    windows: [{ kind: "primary", usedPercent: 72, windowDurationMinutes: 300 }],
  },
});

describe("selectCodexAccountLimits", () => {
  it("keeps matching accounts separate across environments and instances", () => {
    const firstEnvironment = EnvironmentId.make("first");
    const secondEnvironment = EnvironmentId.make("second");
    const selected = selectCodexAccountLimits(
      new Map([
        [
          firstEnvironment,
          {
            label: "Work Mac",
            providers: [provider("codex"), provider("codex_work")],
          },
        ],
        [secondEnvironment, { label: "Home PC", providers: [provider("codex")] }],
      ]),
    );

    expect(
      selected.map(({ environmentLabel, instanceId }) => [environmentLabel, instanceId]),
    ).toEqual([
      ["Work Mac", "codex"],
      ["Work Mac", "codex_work"],
      ["Home PC", "codex"],
    ]);
  });
});

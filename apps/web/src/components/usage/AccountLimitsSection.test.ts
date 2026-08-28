import { describe, expect, it } from "vite-plus/test";

import { formatLimitWindowLabel, formatResetLabel } from "./AccountLimitsSection";

describe("account limit formatting", () => {
  it("names Codex's common windows", () => {
    expect(formatLimitWindowLabel(300)).toBe("5-hour limit");
    expect(formatLimitWindowLabel(10_080)).toBe("Weekly limit");
  });

  it("formats reset time from a stable clock", () => {
    expect(
      formatResetLabel("2026-04-10T01:24:00.000Z", Date.parse("2026-04-10T00:00:00.000Z")),
    ).toBe("Resets in 1h 24m");
  });
});

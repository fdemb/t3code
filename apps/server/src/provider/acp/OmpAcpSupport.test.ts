import { describe, expect, it } from "vite-plus/test";

import { buildOmpAcpSpawnInput } from "./OmpAcpSupport.ts";

describe("buildOmpAcpSpawnInput", () => {
  it("defaults to the `omp acp` stdio server", () => {
    const spawn = buildOmpAcpSpawnInput(null, "/work");

    expect(spawn.command).toBe("omp");
    expect(spawn.args).toEqual(["acp"]);
    expect(spawn.cwd).toBe("/work");
  });

  it("honours a configured binary path", () => {
    const spawn = buildOmpAcpSpawnInput({ binaryPath: "/opt/omp/bin/omp", profile: "" }, "/work");

    expect(spawn.command).toBe("/opt/omp/bin/omp");
  });

  it("passes the profile as OMP_PROFILE rather than a flag", () => {
    const spawn = buildOmpAcpSpawnInput({ binaryPath: "", profile: "t3code" }, "/work", {
      PATH: "/usr/bin",
    });

    // omp's global flags must precede the subcommand; the env var sidesteps
    // that ordering constraint entirely.
    expect(spawn.args).toEqual(["acp"]);
    expect(spawn.env?.OMP_PROFILE).toBe("t3code");
    expect(spawn.env?.PATH).toBe("/usr/bin");
  });

  it("omits OMP_PROFILE when the profile is blank or whitespace", () => {
    expect(
      buildOmpAcpSpawnInput({ binaryPath: "", profile: "   " }, "/work").env,
    ).not.toHaveProperty("OMP_PROFILE");
    expect(buildOmpAcpSpawnInput({ binaryPath: "", profile: "" }, "/work").env).not.toHaveProperty(
      "OMP_PROFILE",
    );
  });
});

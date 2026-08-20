/**
 * omp (Oh My Pi) ACP support.
 *
 * omp ships a first-party ACP server (`omp acp`) that implements the stable
 * protocol surface: `initialize`, `authenticate`, `session/new`,
 * `session/load`, `session/prompt`, `session/set_mode` and
 * `session/set_config_option`. It does **not** implement the unstable
 * `session/set_model` extension, so model selection goes through the
 * negotiated model config option — `AcpSessionRuntime.setModel` already does
 * exactly that, which is why this module has no model-switching code of its
 * own (contrast `GrokAcpSupport`, which drives `setSessionModel`).
 *
 * @module provider/acp/OmpAcpSupport
 */
import type { OmpSettings } from "@t3tools/contracts";
import * as Crypto from "effect/Crypto";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import type * as Scope from "effect/Scope";
import * as ChildProcessSpawner from "effect/unstable/process/ChildProcessSpawner";
import type * as EffectAcpErrors from "effect-acp/errors";

import * as AcpSessionRuntime from "./AcpSessionRuntime.ts";

/**
 * omp resolves auth from whatever provider credentials already live under the
 * active profile, so there is exactly one auth method and it never prompts.
 */
const OMP_AUTH_METHOD_ID = "agent";

/** Selects an isolated omp profile; equivalent to the `--profile` flag. */
const OMP_PROFILE_ENV = "OMP_PROFILE";

type OmpAcpRuntimeSettings = Pick<OmpSettings, "binaryPath" | "profile">;

export interface OmpAcpRuntimeInput extends Omit<
  AcpSessionRuntime.AcpSessionRuntimeOptions,
  "authMethodId" | "clientCapabilities" | "spawn"
> {
  readonly childProcessSpawner: ChildProcessSpawner.ChildProcessSpawner["Service"];
  readonly ompSettings: OmpAcpRuntimeSettings | null | undefined;
  readonly environment?: NodeJS.ProcessEnv;
}

/**
 * Builds the `omp acp` spawn description. The profile is passed as an env var
 * rather than `--profile` so callers never have to care that omp's global
 * flags must precede the subcommand.
 */
export function buildOmpAcpSpawnInput(
  ompSettings: OmpAcpRuntimeSettings | null | undefined,
  cwd: string,
  environment?: NodeJS.ProcessEnv,
): AcpSessionRuntime.AcpSpawnInput {
  const profile = ompSettings?.profile?.trim();
  return {
    command: ompSettings?.binaryPath || "omp",
    args: ["acp"],
    cwd,
    env: {
      ...environment,
      ...(profile ? { [OMP_PROFILE_ENV]: profile } : {}),
    },
  };
}

export const makeOmpAcpRuntime = (
  input: OmpAcpRuntimeInput,
): Effect.Effect<
  AcpSessionRuntime.AcpSessionRuntime["Service"],
  EffectAcpErrors.AcpError,
  Crypto.Crypto | Scope.Scope
> =>
  Effect.gen(function* () {
    const acpContext = yield* Layer.build(
      AcpSessionRuntime.layer({
        ...input,
        spawn: buildOmpAcpSpawnInput(input.ompSettings, input.cwd, input.environment),
        authMethodId: OMP_AUTH_METHOD_ID,
      }).pipe(
        Layer.provide(
          Layer.succeed(ChildProcessSpawner.ChildProcessSpawner, input.childProcessSpawner),
        ),
      ),
    );
    return yield* Effect.service(AcpSessionRuntime.AcpSessionRuntime).pipe(
      Effect.provide(acpContext),
    );
  });

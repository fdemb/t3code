/**
 * omp (Oh My Pi) provider snapshot: install probe, version parsing and model
 * discovery.
 *
 * Model discovery differs from Grok's: omp advertises its catalogue through
 * the ACP `configOptions` entry whose category is `model`, not through the
 * `session/new` `models` field, so this module walks config options instead
 * of `SessionModelState`.
 *
 * @module provider/Layers/OmpProvider
 */
import {
  type ModelCapabilities,
  type OmpSettings,
  type ServerProvider,
  type ServerProviderModel,
} from "@t3tools/contracts";
import type * as EffectAcpSchema from "effect-acp/schema";
import { causeErrorTag } from "@t3tools/shared/observability";
import type * as Crypto from "effect/Crypto";
import * as DateTime from "effect/DateTime";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Option from "effect/Option";
import * as Result from "effect/Result";
import { HttpClient } from "effect/unstable/http";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";
import { createModelCapabilities, normalizeCustomModelSlug } from "@t3tools/shared/model";
import { resolveSpawnCommand } from "@t3tools/shared/shell";

import {
  buildServerProvider,
  isCommandMissingCause,
  parseGenericCliVersion,
  providerModelsFromSettings,
  spawnAndCollect,
  type ServerProviderDraft,
} from "../providerSnapshot.ts";
import {
  enrichProviderSnapshotWithVersionAdvisory,
  type ProviderMaintenanceCapabilities,
} from "../providerMaintenance.ts";
import { makeOmpAcpRuntime } from "../acp/OmpAcpSupport.ts";

const OMP_PRESENTATION = {
  displayName: "omp",
  badgeLabel: "Early Access",
  // omp exposes a read-only `plan` mode alongside `default`.
  showInteractionModeToggle: true,
} as const;
const EMPTY_CAPABILITIES: ModelCapabilities = createModelCapabilities({
  optionDescriptors: [],
});

const VERSION_PROBE_TIMEOUT_MS = 4_000;
const OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS = 15_000;

/**
 * Fallback shown before discovery succeeds. omp routes to many upstream
 * providers, so there is no meaningful built-in slug to hardcode; an empty
 * list plus the user's custom models keeps the picker honest.
 */
const OMP_BUILT_IN_MODELS: ReadonlyArray<ServerProviderModel> = [];

function ompModelsFromSettings(
  customModels: ReadonlyArray<string> | undefined,
  builtInModels: ReadonlyArray<ServerProviderModel> = OMP_BUILT_IN_MODELS,
): ReadonlyArray<ServerProviderModel> {
  return providerModelsFromSettings(builtInModels, customModels ?? [], EMPTY_CAPABILITIES);
}

export function buildInitialOmpProviderSnapshot(
  ompSettings: OmpSettings,
): Effect.Effect<ServerProviderDraft> {
  return Effect.gen(function* () {
    const checkedAt = yield* Effect.map(DateTime.now, DateTime.formatIso);
    const models = ompModelsFromSettings(ompSettings.customModels);

    if (!ompSettings.enabled) {
      return buildServerProvider({
        presentation: OMP_PRESENTATION,
        enabled: false,
        checkedAt,
        models,
        probe: {
          installed: false,
          version: null,
          status: "warning",
          auth: { status: "unknown" },
          message: "omp is disabled in T3 Code settings.",
        },
      });
    }

    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: true,
      checkedAt,
      models,
      probe: {
        installed: true,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "Checking omp availability...",
      },
    });
  });
}

/**
 * Flattens the `model` config option into provider models. Option entries are
 * either leaves (`{ value, name }`) or groups carrying nested leaves, which is
 * why this cannot reuse `collectSessionConfigOptionValues` — that helper drops
 * the display names.
 */
export function buildOmpDiscoveredModelsFromConfigOptions(
  configOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> | null | undefined,
): ReadonlyArray<ServerProviderModel> {
  const modelOption = configOptions?.find((option) => option.category === "model");
  if (!modelOption || modelOption.type !== "select") {
    return [];
  }

  const leaves = modelOption.options.flatMap((entry) =>
    "value" in entry ? [entry] : entry.options,
  );
  const seen = new Set<string>();
  const models: Array<ServerProviderModel> = [];
  for (const leaf of leaves) {
    const slug = normalizeCustomModelSlug(leaf.value);
    if (!slug || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    models.push({
      slug,
      name: leaf.name.trim() || slug,
      isCustom: false,
      capabilities: EMPTY_CAPABILITIES,
    });
  }
  return models;
}

const discoverOmpModelsViaAcp = (
  ompSettings: OmpSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const childProcessSpawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const acp = yield* makeOmpAcpRuntime({
      ompSettings,
      environment,
      childProcessSpawner,
      cwd: process.cwd(),
      clientInfo: { name: "t3-code-provider-probe", version: "0.0.0" },
    });
    const started = yield* acp.start();
    return buildOmpDiscoveredModelsFromConfigOptions(started.sessionSetupResult.configOptions);
  }).pipe(Effect.scoped);

const runOmpVersionCommand = (
  ompSettings: OmpSettings,
  environment: NodeJS.ProcessEnv = process.env,
) =>
  Effect.gen(function* () {
    const command = ompSettings.binaryPath || "omp";
    const spawnCommand = yield* resolveSpawnCommand(command, ["--version"], {
      env: environment,
    });
    return yield* spawnAndCollect(
      command,
      ChildProcess.make(spawnCommand.command, spawnCommand.args, {
        env: environment,
        shell: spawnCommand.shell,
      }),
    );
  });

export const checkOmpProviderStatus = Effect.fn("checkOmpProviderStatus")(function* (
  ompSettings: OmpSettings,
  environment: NodeJS.ProcessEnv = process.env,
): Effect.fn.Return<
  ServerProviderDraft,
  never,
  ChildProcessSpawner.ChildProcessSpawner | Crypto.Crypto
> {
  const checkedAt = DateTime.formatIso(yield* DateTime.now);
  const fallbackModels = ompModelsFromSettings(ompSettings.customModels);

  if (!ompSettings.enabled) {
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: false,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: false,
        version: null,
        status: "warning",
        auth: { status: "unknown" },
        message: "omp is disabled in T3 Code settings.",
      },
    });
  }

  const versionResult = yield* runOmpVersionCommand(ompSettings, environment).pipe(
    Effect.timeoutOption(VERSION_PROBE_TIMEOUT_MS),
    Effect.result,
  );

  if (Result.isFailure(versionResult)) {
    const error = versionResult.failure;
    yield* Effect.logWarning("omp health check failed.", { errorTag: error._tag });
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: ompSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: !isCommandMissingCause(error),
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: isCommandMissingCause(error)
          ? "omp is not installed or not on PATH."
          : "Failed to execute omp health check.",
      },
    });
  }

  if (Option.isNone(versionResult.success)) {
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: ompSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version: null,
        status: "error",
        auth: { status: "unknown" },
        message: "omp is installed but timed out while running `omp --version`.",
      },
    });
  }

  const versionOutput = versionResult.success.value;
  const version = parseGenericCliVersion(`${versionOutput.stdout}\n${versionOutput.stderr}`);
  if (versionOutput.code !== 0) {
    yield* Effect.logWarning("omp version probe exited with a non-zero status.", {
      exitCode: versionOutput.code,
      stdoutLength: versionOutput.stdout.length,
      stderrLength: versionOutput.stderr.length,
    });
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: ompSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "omp is installed but failed to run.",
      },
    });
  }

  const discoveryExit = yield* discoverOmpModelsViaAcp(ompSettings, environment).pipe(
    Effect.timeoutOption(OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS),
    Effect.exit,
  );
  if (Exit.isFailure(discoveryExit)) {
    yield* Effect.logWarning("omp ACP model discovery failed", {
      errorTag: causeErrorTag(discoveryExit.cause),
    });
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: ompSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: "omp is installed but ACP startup failed. Check server logs for details.",
      },
    });
  }
  if (Option.isNone(discoveryExit.value)) {
    yield* Effect.logWarning(
      `omp ACP model discovery timed out after ${OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
    );
    return buildServerProvider({
      presentation: OMP_PRESENTATION,
      enabled: ompSettings.enabled,
      checkedAt,
      models: fallbackModels,
      probe: {
        installed: true,
        version,
        status: "error",
        auth: { status: "unknown" },
        message: `omp is installed but ACP startup timed out after ${OMP_ACP_MODEL_DISCOVERY_TIMEOUT_MS}ms.`,
      },
    });
  }

  const discoveredModels = discoveryExit.value.value;
  const models =
    discoveredModels.length > 0
      ? ompModelsFromSettings(ompSettings.customModels, discoveredModels)
      : fallbackModels;

  return buildServerProvider({
    presentation: OMP_PRESENTATION,
    enabled: ompSettings.enabled,
    checkedAt,
    models,
    probe: {
      installed: true,
      version,
      status: "ready",
      auth: { status: "unknown" },
    },
  });
});

export const enrichOmpSnapshot = (input: {
  readonly snapshot: ServerProvider;
  readonly maintenanceCapabilities: ProviderMaintenanceCapabilities;
  readonly enableProviderUpdateChecks?: boolean;
  readonly publishSnapshot: (snapshot: ServerProvider) => Effect.Effect<void>;
  readonly httpClient: HttpClient.HttpClient;
}): Effect.Effect<void> => {
  const { snapshot, publishSnapshot } = input;

  return enrichProviderSnapshotWithVersionAdvisory(snapshot, input.maintenanceCapabilities, {
    enableProviderUpdateChecks: input.enableProviderUpdateChecks,
  }).pipe(
    Effect.provideService(HttpClient.HttpClient, input.httpClient),
    Effect.flatMap((enrichedSnapshot) => publishSnapshot(enrichedSnapshot)),
    Effect.catchCause((cause) =>
      Effect.logWarning("omp version advisory enrichment failed", {
        errorTag: causeErrorTag(cause),
      }),
    ),
    Effect.asVoid,
  );
};

import type * as EffectAcpSchema from "effect-acp/schema";
import { describe, expect, it } from "vite-plus/test";

import { buildOmpDiscoveredModelsFromConfigOptions } from "./OmpProvider.ts";

/** Shaped after a real `session/new` response from `omp acp`. */
const ompConfigOptions: ReadonlyArray<EffectAcpSchema.SessionConfigOption> = [
  {
    id: "mode",
    name: "Mode",
    category: "mode",
    type: "select",
    currentValue: "default",
    options: [
      { value: "default", name: "Default" },
      { value: "plan", name: "Plan" },
    ],
  },
  {
    id: "model",
    name: "Model",
    category: "model",
    type: "select",
    currentValue: "openai-codex/gpt-5.6-sol",
    options: [
      { value: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
      { value: "openai-codex/gpt-5.6-sol", name: "GPT-5.6 Sol" },
    ],
  },
];

describe("buildOmpDiscoveredModelsFromConfigOptions", () => {
  it("reads the catalogue from the model-category config option", () => {
    const models = buildOmpDiscoveredModelsFromConfigOptions(ompConfigOptions);

    expect(models.map((model) => model.slug)).toEqual([
      "anthropic/claude-haiku-4-5",
      "openai-codex/gpt-5.6-sol",
    ]);
    expect(models[0]?.name).toBe("Claude Haiku 4.5");
    expect(models.every((model) => model.isCustom === false)).toBe(true);
  });

  it("preserves provider-qualified slugs verbatim", () => {
    const [model] = buildOmpDiscoveredModelsFromConfigOptions(ompConfigOptions);

    // omp routes to upstream providers, so the `provider/model` pair is the
    // identity — splitting or rewriting it would break `setModel`.
    expect(model?.slug).toContain("/");
  });

  it("flattens grouped options and de-duplicates repeated slugs", () => {
    const models = buildOmpDiscoveredModelsFromConfigOptions([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "anthropic/claude-opus-5",
        options: [
          { value: "anthropic/claude-opus-5", name: "Claude Opus 5" },
          {
            name: "Anthropic",
            options: [
              { value: "anthropic/claude-opus-5", name: "Claude Opus 5 (dupe)" },
              { value: "anthropic/claude-haiku-4-5", name: "Claude Haiku 4.5" },
            ],
          },
        ],
      } as EffectAcpSchema.SessionConfigOption,
    ]);

    expect(models.map((model) => model.slug)).toEqual([
      "anthropic/claude-opus-5",
      "anthropic/claude-haiku-4-5",
    ]);
  });

  it("falls back to the slug when a display name is blank", () => {
    const models = buildOmpDiscoveredModelsFromConfigOptions([
      {
        id: "model",
        name: "Model",
        category: "model",
        type: "select",
        currentValue: "x/y",
        options: [{ value: "x/y", name: "   " }],
      },
    ]);

    expect(models[0]?.name).toBe("x/y");
  });

  it("returns nothing when omp advertises no model option", () => {
    expect(buildOmpDiscoveredModelsFromConfigOptions(undefined)).toEqual([]);
    expect(buildOmpDiscoveredModelsFromConfigOptions([])).toEqual([]);
    expect(buildOmpDiscoveredModelsFromConfigOptions([ompConfigOptions[0]!])).toEqual([]);
  });
});

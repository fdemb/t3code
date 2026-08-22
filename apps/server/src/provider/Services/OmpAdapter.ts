/**
 * OmpAdapter — shape type for the omp (Oh My Pi) provider adapter.
 *
 * Mirrors the other ACP-backed adapters: the driver model
 * ({@link ../Drivers/OmpDriver}) bundles one adapter per instance as a
 * captured closure, so this module only retains the shape interface as a
 * naming anchor for that bundle.
 *
 * @module OmpAdapter
 */
import type { ProviderAdapterError } from "../Errors.ts";
import type { ProviderAdapterShape } from "./ProviderAdapter.ts";

/**
 * OmpAdapterShape — per-instance omp adapter contract. Carries a branded
 * driver kind as the nominal discriminant.
 */
export interface OmpAdapterShape extends ProviderAdapterShape<ProviderAdapterError> {}

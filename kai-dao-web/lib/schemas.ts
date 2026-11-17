import { z } from "zod";

/**
 * Only what this app reads from the node. Unknown fields are dropped by zod,
 * never trusted; every field the UI shows is validated here first. A shape we
 * do not recognise becomes an error on screen instead of `undefined` in the
 * markup.
 */

const hex64 = z.string().regex(/^[0-9a-f]{64}$/);

export const healthSchema = z.object({
  status: z.string(),
  tick: z.number().int().nonnegative(),
  peers: z.number().int().nonnegative().optional(),
  version: z.string(),
});
export type Health = z.infer<typeof healthSchema>;

export const finalitySchema = z.enum(["Pending", "SoftFinal", "HardFinal", "Rejected", "Voided"]);
export type Finality = z.infer<typeof finalitySchema>;

export const transactionSchema = z.object({
  finality: finalitySchema,
  exec_status: z.enum(["ok", "failed", "pending"]).nullable().optional(),
  exec_error: z.string().nullable().optional(),
  action: z.string().optional(),
});
export type Transaction = z.infer<typeof transactionSchema>;

export const rcpMetadataSchema = z.object({
  rcp_type: z.string(),
  version: z.string(),
  traits: z.array(z.string()),
  capabilities: z.array(z.string()).optional(),
  declared_weight: z.number().int().nonnegative().optional(),
});

export const contractSchema = z.object({
  contract_id: hex64,
  deployer: z.string(),
  code_hash: hex64,
  weight: z.number().int().nonnegative().optional(),
  status: z.string(),
  rcp_metadata: rcpMetadataSchema,
});
export type ContractRecord = z.infer<typeof contractSchema>;

/** The envelope of a free `query`. `output` is a JSON string of its own. */
export const queryEnvelopeSchema = z.object({
  contract_id: hex64,
  method: z.string(),
  ok: z.boolean(),
  output: z.string(),
  view: z.boolean().optional(),
});

export const eventSchema = z.object({
  contract_id: hex64,
  event_type: z.string(),
  event_idx: z.number().int().nonnegative(),
  data: z.string(),
  tick: z.number().int().nonnegative().optional(),
  timestamp: z.number().int().nonnegative().optional(),
  tx_id: z.string().optional(),
});
export type ContractEvent = z.infer<typeof eventSchema>;

export const eventsPageSchema = z.object({
  contract_id: hex64.optional(),
  ok: z.boolean().optional(),
  count: z.number().int().nonnegative().optional(),
  events: z.array(eventSchema),
  next: z.string().nullable().optional(),
  more: z.boolean(),
});
export type EventsPage = z.infer<typeof eventsPageSchema>;

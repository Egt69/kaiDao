import { z } from "zod";

const HEX64 = /^[0-9a-f]{64}$/;

/**
 * Server-side configuration. Every value is public: this app keeps no secrets,
 * no API key and no seed. Parsed once, and the process refuses to start on a
 * network other than the Retium testnet.
 */
const schema = z.object({
  RETIUM_RPC_URL: z
    .string()
    .url()
    .default("https://rpc.retium.org")
    .refine((value) => value.startsWith("https://"), {
      message: "RETIUM_RPC_URL must use https",
    }),
  RETIUM_CHAIN_ID: z.coerce.number().int().default(3),
  RETIUM_CONTRACT_ID: z
    .string()
    .regex(HEX64)
    .default("cd67349e35f885134d3b3969d9b7780716d9c38abfee155c16cc2a607ba2a931"),
  RETIUM_CONTRACT_CODE_HASH: z
    .string()
    .regex(HEX64)
    .default("8b63cfc5fed9fe6f18e38ee46e8d0babb71315aaf8b6957b8dd0cdc9238a6592"),
  RETIUM_WALLET_SDK_VERSION: z.string().default("1.5.0"),
  RETIUM_WALLET_SDK_INTEGRITY: z
    .string()
    .startsWith("sha384-")
    .default("sha384-IZZw04xxx1GLXviLZ7lw+B5XTi4SNw7Y6fUYf2zdJ8b54pBxVv5KqdvLSjQhZL3v"),
});

const parsed = schema.safeParse({
  RETIUM_RPC_URL: process.env.RETIUM_RPC_URL,
  RETIUM_CHAIN_ID: process.env.RETIUM_CHAIN_ID,
  RETIUM_CONTRACT_ID: process.env.RETIUM_CONTRACT_ID,
  RETIUM_CONTRACT_CODE_HASH: process.env.RETIUM_CONTRACT_CODE_HASH,
  RETIUM_WALLET_SDK_VERSION: process.env.RETIUM_WALLET_SDK_VERSION,
  RETIUM_WALLET_SDK_INTEGRITY: process.env.RETIUM_WALLET_SDK_INTEGRITY,
});

if (!parsed.success) {
  throw new Error(
    `Invalid environment: ${parsed.error.issues
      .map((issue) => `${issue.path.join(".")} ${issue.message}`)
      .join("; ")}`,
  );
}

export const env = parsed.data;

/** The only chain this application will talk to: the Retium public testnet. */
export const EXPECTED_CHAIN_ID = 3;

if (env.RETIUM_CHAIN_ID !== EXPECTED_CHAIN_ID) {
  throw new Error(
    `RETIUM_CHAIN_ID is ${env.RETIUM_CHAIN_ID} but this build only supports the ` +
      `Retium public testnet (chain id ${EXPECTED_CHAIN_ID}). Refusing to start.`,
  );
}

export const WALLET_SDK_URL = `https://wallet.retium.org/connect/sdk/retium-sdk-${env.RETIUM_WALLET_SDK_VERSION}.js`;

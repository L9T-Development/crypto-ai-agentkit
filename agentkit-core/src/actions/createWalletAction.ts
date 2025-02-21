import { z } from "zod";
import { createWallet } from "../services";
import { AgentkitAction } from "../agentkit";

const CREATE_WALLET_PROMPT = `
This tool will create a temporary wallet by generating a new private key.
WARNING: This is for temporary use only. Do not use for storing significant funds.
`;

export const CreateWalletInput = z
  .object({})
  .strip()
  .describe("No inputs needed - generates a new private key");

/**
 * Creates a temporary wallet by generating a private key.
 *
 * @returns A message containing the private key.
 */
export async function createTempWallet(): Promise<string> {
  try {
    const privateKey = createWallet();
    return `Generated temporary private key: ${privateKey}\n\nWARNING: Store this safely and do not share it with anyone. This key is for temporary use only.`;
  } catch (error) {
    return `Error creating wallet: ${error}`;
  }
}

/**
 * Create wallet action.
 */
export class CreateWalletAction implements AgentkitAction<typeof CreateWalletInput> {
  public name = "create_wallet";
  public description = CREATE_WALLET_PROMPT;
  public argsSchema = CreateWalletInput;
  public func = createTempWallet;
  public smartAccountRequired = false;
}

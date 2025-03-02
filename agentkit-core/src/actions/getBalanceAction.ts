import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getWalletBalance } from "../services";
import { AgentkitAction } from "../agentkit";

const GET_BALANCE_PROMPT = `
This tool gets the balance of the smart account that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

When no token addresses are provided, it returns the native token (ETH) balance by default.
When token addresses are provided, it returns the balance for each specified token.

USAGE GUIDANCE:
- When a user asks to check or get balances, use this tool immediately without asking for confirmation
- If the user doesn't specify token addresses, just call the tool with no parameters to get the ETH balance
- Only ask for token addresses if the user specifically mentions wanting to check token balances

Note: This action works on supported networks only (Base, Fantom, Moonbeam, Metis, Avalanche, BSC).
`;

export const GetBalanceInput = z
  .object({
    tokenAddresses: z
      .array(z.string())
      .optional()
      .describe("Optional list of token addresses to get balances for"),
  })
  .strip()
  .describe("Instructions for getting smart account balance");

/**
 * Gets balance for the smart account.
 *
 * @param wallet - The smart account to get the balance for.
 * @param args - The input arguments for the action.
 * @returns A message containing the balance information.
 */
export async function getBalance(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof GetBalanceInput>,
): Promise<string> {
  try {
    // Convert string addresses to 0x format if provided
    const tokenAddresses = args.tokenAddresses?.map(addr => addr as `0x${string}`);
    const balances = await getWalletBalance(wallet, tokenAddresses);
    if (!balances) {
      return "Error getting balance: No balance information returned from the provider";
    }
    
    if (balances.length === 0) {
      return "No balances found for the requested tokens";
    }

    // Format the balance response
    const balanceStrings = balances.map(
      balance => `${balance.address}: ${balance.formattedAmount}`
    );
    
    return `Smart Account Balances:\n${balanceStrings.join("\n")}`;
  } catch (error) {
    console.error("Balance fetch error:", error);
    return `Error getting balance: ${error instanceof Error ? error.message : String(error)}`;
  }
}

/**
 * Get wallet balance action.
 */
export class GetBalanceAction implements AgentkitAction<typeof GetBalanceInput> {
  public name = "get_balance";
  public description = GET_BALANCE_PROMPT;
  public argsSchema = GetBalanceInput;
  public func = getBalance;
  public smartAccountRequired = true;
}

import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { getWalletBalance } from "../services";
import { AgentkitAction } from "../agentkit";
import { tokenMappings, commonTokens } from "../constants";

const GET_BALANCE_PROMPT = `
This tool gets the balance of the smart account that is already configured with the SDK.
No additional wallet setup or private key generation is needed.

You can check balances in two ways:
1. By token ticker symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)
2. By token contract addresses (e.g., "0x...")

When no tokens are specified, it returns the native token (ETH) balance by default.
When tokens are specified, it returns the balance for each specified token.

USAGE GUIDANCE:
- When a user asks to check or get balances, use this tool immediately without asking for confirmation
- If the user doesn't specify tokens, just call the tool with no parameters to get the ETH balance
- If the user mentions specific tokens by name (like "USDC" or "USDT"), use the tokenSymbols parameter
- Only use tokenAddresses parameter if the user specifically provides contract addresses

Note: This action works on supported networks only (Base, Fantom, Moonbeam, Metis, Avalanche, BSC).
`;

export const GetBalanceInput = z
  .object({
    tokenAddresses: z
      .array(z.string())
      .optional()
      .describe("Optional list of token contract addresses to get balances for"),
    tokenSymbols: z
      .array(z.string())
      .optional()
      .describe("Optional list of token symbols (e.g., 'USDC', 'USDT', 'WETH') to get balances for"),
  })
  .strip()
  .describe("Instructions for getting smart account balance");

/**
 * Resolves token symbols to their contract addresses based on the current chain
 * 
 * @param wallet - The smart account to get chain information from
 * @param symbols - Array of token symbols to resolve
 * @returns Array of token addresses
 */
async function resolveTokenSymbols(
  wallet: ZeroXgaslessSmartAccount,
  symbols: string[]
): Promise<`0x${string}`[]> {
  const chainId = wallet.rpcProvider.chain?.id;
  if (!chainId || !tokenMappings[chainId]) {
    console.warn(`Chain ID ${chainId} not found in token mappings`);
    return [];
  }

  const chainTokens = tokenMappings[chainId];
  const resolvedAddresses: `0x${string}`[] = [];

  for (const symbol of symbols) {
    const normalizedSymbol = symbol.toUpperCase();
    if (chainTokens[normalizedSymbol]) {
      resolvedAddresses.push(chainTokens[normalizedSymbol]);
    } else {
      console.warn(`Token symbol ${normalizedSymbol} not found for chain ID ${chainId}`);
    }
  }

  return resolvedAddresses;
}

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
    let tokenAddresses: `0x${string}`[] = [];

    // Process token addresses if provided
    if (args.tokenAddresses && args.tokenAddresses.length > 0) {
      tokenAddresses = args.tokenAddresses.map(addr => addr as `0x${string}`);
    }

    // Process token symbols if provided
    if (args.tokenSymbols && args.tokenSymbols.length > 0) {
      const symbolAddresses = await resolveTokenSymbols(wallet, args.tokenSymbols);
      tokenAddresses = [...tokenAddresses, ...symbolAddresses];
    }

    // Remove duplicates
    tokenAddresses = [...new Set(tokenAddresses)];

    // Get balances
    const balances = await getWalletBalance(wallet, tokenAddresses.length > 0 ? tokenAddresses : undefined);
    if (!balances) {
      return "Error getting balance: No balance information returned from the provider";
    }
    
    if (balances.length === 0) {
      return "No balances found for the requested tokens";
    }

    // Format the balance response
    const balanceStrings = balances.map(balance => {
      // Try to find a symbol for this address
      const chainId = wallet.rpcProvider.chain?.id;
      let displayName = balance.address;
      
      if (chainId && tokenMappings[chainId]) {
        const chainTokens = tokenMappings[chainId];
        // Find token symbol by address
        for (const [symbol, address] of Object.entries(chainTokens)) {
          if (address.toLowerCase() === balance.address.toLowerCase()) {
            displayName = symbol;
            break;
          }
        }
      }
      
      return `${displayName}: ${balance.formattedAmount}`;
    });
    
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

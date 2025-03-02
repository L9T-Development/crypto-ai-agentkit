import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { sendTransaction, waitForTransaction, fetchTokenDetails, getDecimals } from "../../services";
import { tokenMappings } from "../../constants";
import { parseUnits } from "viem";

const SWAP_PROMPT = `
This tool allows you to perform gasless token swaps on supported chains.

You can swap tokens in two ways:
1. Using token addresses (e.g., "0x...")
2. Using token symbols (e.g., "ETH", "USDC", "USDT", "WETH", etc.)

USAGE GUIDANCE:
- Provide either tokenIn/tokenOut addresses OR tokenInSymbol/tokenOutSymbol
- Specify the amount to swap (in the input token's units)
- Optionally set 'wait: true' to wait for transaction confirmation
- Optionally set a custom slippage (default is "auto")

EXAMPLES:
- Swap by address: "Swap 10 from 0x123... to 0x456..."
- Swap by symbol: "Swap 10 USDC to ETH"
- With waiting: "Swap 5 USDT to USDC and wait for confirmation"

Note: This action works on supported networks only (Base, Fantom, Moonbeam, Metis, Avalanche, BSC).
All swaps are gasless - no native tokens needed for gas fees.
`;

export const SmartSwapInput = z
  .object({
    tokenIn: z
      .string()
      .optional()
      .describe("The address of the input token (token you're selling)"),
    tokenOut: z
      .string()
      .optional()
      .describe("The address of the output token (token you're buying)"),
    tokenInSymbol: z
      .string()
      .optional()
      .describe("The symbol of the input token (e.g., 'ETH', 'USDC')"),
    tokenOutSymbol: z
      .string()
      .optional()
      .describe("The symbol of the output token (e.g., 'ETH', 'USDC')"),
    amount: z.string().describe("The amount of input token to swap"),
    slippage: z
      .string()
      .optional()
      .default("auto")
      .describe("Slippage tolerance in percentage (e.g., '0.5') or 'auto'"),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to wait for transaction confirmation"),
  })
  .strip()
  .describe("Instructions for swapping tokens");

/**
 * Resolves token symbols to their contract addresses based on the current chain
 *
 * @param wallet - The smart account to get chain information from
 * @param symbol - Token symbol to resolve
 * @returns Token address or null if not found
 */
async function resolveTokenSymbol(
  wallet: ZeroXgaslessSmartAccount,
  symbol: string,
): Promise<`0x${string}` | null> {
  const chainId = wallet.rpcProvider.chain?.id;
  if (!chainId || !tokenMappings[chainId]) {
    console.warn(`Chain ID ${chainId} not found in token mappings`);
    return null;
  }

  const chainTokens = tokenMappings[chainId];
  const normalizedSymbol = symbol.toUpperCase();

  if (chainTokens[normalizedSymbol]) {
    return chainTokens[normalizedSymbol];
  }

  // Special case for native token (ETH, AVAX, BNB, etc.)
  if (
    normalizedSymbol === "ETH" ||
    normalizedSymbol === "AVAX" ||
    normalizedSymbol === "BNB" ||
    normalizedSymbol === "FTM" ||
    normalizedSymbol === "METIS" ||
    normalizedSymbol === "GLMR"
  ) {
    return "0x0000000000000000000000000000000000000000";
  }

  console.warn(`Token symbol ${normalizedSymbol} not found for chain ID ${chainId}`);
  return null;
}

/**
 * Format amount with proper decimals for the API
 * 
 * @param wallet - The smart account to use for querying
 * @param tokenAddress - The token address
 * @param amount - The human-readable amount (e.g., "0.001")
 * @returns The amount formatted with proper decimals
 */
async function formatTokenAmount(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: `0x${string}`,
  amount: string
): Promise<string> {
  try {
    // For native token (address 0x0)
    if (tokenAddress === "0x0000000000000000000000000000000000000000") {
      return parseUnits(amount, 18).toString();
    }

    // Get token decimals
    const decimals = await getDecimals(wallet, tokenAddress);
    if (!decimals) {
      throw new Error(`Could not get decimals for token ${tokenAddress}`);
    }

    // Parse the amount with proper decimals
    return parseUnits(amount, Number(decimals)).toString();
  } catch (error) {
    console.error("Error formatting token amount:", error);
    // Fallback to assuming 18 decimals if we can't get the actual decimals
    return parseUnits(amount, 18).toString();
  }
}

export async function smartSwap(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartSwapInput>,
): Promise<string> {
  try {
    const chainId = wallet.rpcProvider.chain?.id;
    if (!chainId) {
      return "Error: Unable to determine chain ID from wallet";
    }

    // Resolve token addresses from symbols if provided
    let tokenInAddress = args.tokenIn;
    let tokenOutAddress = args.tokenOut;

    if (args.tokenInSymbol && !tokenInAddress) {
      const resolved = await resolveTokenSymbol(wallet, args.tokenInSymbol);
      if (!resolved) {
        return `Error: Could not resolve token symbol "${args.tokenInSymbol}" to an address on chain ${chainId}`;
      }
      tokenInAddress = resolved;
    }

    if (args.tokenOutSymbol && !tokenOutAddress) {
      const resolved = await resolveTokenSymbol(wallet, args.tokenOutSymbol);
      if (!resolved) {
        return `Error: Could not resolve token symbol "${args.tokenOutSymbol}" to an address on chain ${chainId}`;
      }
      tokenOutAddress = resolved;
    }

    if (!tokenInAddress || !tokenOutAddress) {
      return "Error: Both input and output token addresses are required";
    }

    // Get token details for better user feedback
    let tokenInDetails;
    let tokenOutDetails;

    try {
      tokenInDetails = await fetchTokenDetails(wallet, tokenInAddress);
      tokenOutDetails = await fetchTokenDetails(wallet, tokenOutAddress);
    } catch (error) {
      console.warn("Error fetching token details:", error);
      // Continue even if we can't get token details
    }

    // Format the amount with proper decimals
    const formattedAmount = await formatTokenAmount(wallet, tokenInAddress as `0x${string}`, args.amount);

    // Construct the API URL with query parameters
    const baseUrl = "https://dln.debridge.finance/v1.0/chain/transaction";
    const queryParams = new URLSearchParams({
      chainId: chainId.toString(),
      tokenIn: tokenInAddress,
      tokenInAmount: formattedAmount,
      tokenOut: tokenOutAddress,
      tokenOutRecipient: await wallet.getAddress(),
      slippage: args.slippage || "auto",
      affiliateFeePercent: "0",
    });
    const url = `${baseUrl}?${queryParams.toString()}`;
    console.log("Swap API URL:", url);

    // First try to get an estimation to check if the swap is possible
    try {
      const estimationUrl = url.replace("/transaction", "/estimation");
      const estimationResponse = await fetch(estimationUrl);
      const estimationText = await estimationResponse.text();
      
      try {
        const estimationData = JSON.parse(estimationText);
        if (!estimationResponse.ok) {
          if (estimationData.message?.includes("insufficient liquidity") || 
              estimationData.message?.includes("no route found")) {
            return `Swap not available: Insufficient liquidity or no route found between these tokens.`;
          }
          
          if (estimationData.message?.includes("amount too small")) {
            return `Swap not available: The amount is too small. Please try a larger amount.`;
          }
          
          console.warn("Estimation failed:", estimationData);
        }
      } catch (parseError) {
        console.warn("Failed to parse estimation response:", parseError);
      }
    } catch (error) {
      console.warn("Error checking swap estimation:", error);
      // Continue even if estimation fails
    }

    const response = await fetch(url);
    const responseText = await response.text();

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      return `Swap failed: Invalid response from API: ${responseText}`;
    }

    if (!response.ok) {
      // Handle specific error cases
      if (data.message?.includes("insufficient liquidity") || data.message?.includes("no route found")) {
        return `Swap failed: Insufficient liquidity or no route found between these tokens.`;
      }
      
      if (data.message?.includes("amount too small")) {
        return `Swap failed: The amount is too small. Please try a larger amount.`;
      }
      
      if (data.message?.includes("Bad Request")) {
        return `Swap failed: Invalid request parameters. Please check your token addresses and amount.
        
For BNB Chain (56), make sure:
1. The token amount is not too small (try at least 0.01 USDT)
2. There is sufficient liquidity for this pair
3. You have enough balance of the input token`;
      }
      
      return `Swap failed: ${data.message || response.statusText}\nDetails: ${JSON.stringify(data.details || {})}`;
    }

    // If we only got an estimation without transaction data
    if (!data.tx) {
      const inSymbol = tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
      const outSymbol = tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

      return `Swap estimation:\nInput: ${data.tokenIn.amount} ${data.tokenIn.symbol || inSymbol}\nExpected Output: ${data.tokenOut.amount} ${data.tokenOut.symbol || outSymbol}\nMin Output: ${data.tokenOut.minAmount} ${data.tokenOut.symbol || outSymbol}\nRecommended Slippage: ${data.recommendedSlippage}%`;
    }

    const tx = {
      to: data.tx.to as `0x${string}`,
      data: data.tx.data as `0x${string}`,
      value: BigInt(data.tx.value || 0),
    };

    const txResponse = await sendTransaction(wallet, tx);
    if (!txResponse.success) {
      return `Swap failed: ${txResponse.error}`;
    }

    const inSymbol =
      data.tokenIn.symbol || tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
    const outSymbol =
      data.tokenOut.symbol || tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

    if (args.wait) {
      const status = await waitForTransaction(wallet, txResponse.userOpHash);
      if (status.status === "confirmed") {
        return `Swap completed and confirmed in block ${status.blockNumber}!
Input: ${data.tokenIn.amount} ${inSymbol}
Expected Output: ${data.tokenOut.amount} ${outSymbol}
Transaction Hash: ${status.receipt?.receipt?.transactionHash || txResponse.userOpHash}`;
      } else {
        return `Swap status: ${status.status}
${status.error || ""}
User Operation Hash: ${txResponse.userOpHash}`;
      }
    }

    return `Swap order submitted successfully!
Input: ${data.tokenIn.amount} ${inSymbol}
Expected Output: ${data.tokenOut.amount} ${outSymbol}
User Operation Hash: ${txResponse.userOpHash}

You can either:
1. Check the status by asking: "What's the status of transaction ${txResponse.userOpHash}?"
2. Or next time, add "wait: true" to wait for confirmation, like: "Swap 100 USDC to USDT and wait for confirmation"`;
  } catch (error) {
    console.error("Swap error:", error);
    return `Error creating swap order: ${error instanceof Error ? error.message : String(error)}`;
  }
}

export class SmartSwapAction implements AgentkitAction<typeof SmartSwapInput> {
  public name = "smart_swap";
  public description = SWAP_PROMPT;
  public argsSchema = SmartSwapInput;
  public func = smartSwap;
  public smartAccountRequired = true;
}

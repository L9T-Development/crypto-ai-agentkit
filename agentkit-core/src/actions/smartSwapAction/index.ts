import { z } from "zod";
import { Transaction, ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import {
  sendTransaction,
  waitForTransaction,
  formatTokenAmount,
  resolveTokenSymbol,
  checkAndApproveTokenAllowance,
} from "../../services";

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
- Optionally set 'approveMax: true' to approve maximum token allowance (default is false)

EXAMPLES:
- Swap by address: "Swap 10 from 0x123... to 0x456..."
- Swap by symbol: "Swap 10 USDC to ETH"
- With waiting: "Swap 5 USDT to USDC and wait for confirmation"
- With max approval: "Swap 10 USDT to ETH with approveMax: true"

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
    approveMax: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to approve maximum token allowance"),
  })
  .strip()
  .describe("Instructions for swapping tokens");

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
    /*
    try {
      tokenInDetails = await fetchTokenDetails(wallet, tokenInAddress);
      tokenOutDetails = await fetchTokenDetails(wallet, tokenOutAddress);
    } catch (error) {
      console.warn("Error fetching token details:", error);
      // Continue even if we can't get token details
    }
    */

    // Format the amount with proper decimals
    const formattedAmount = await formatTokenAmount(
      wallet,
      tokenInAddress as `0x${string}`,
      args.amount,
    );
    console.log("Formatted amount:", formattedAmount);

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
    const formedDebridgeApiUrl = `${baseUrl}?${queryParams.toString()}`;
    console.log("Swap API URL:", formedDebridgeApiUrl);

    // First try to get an estimation to check if the swap is possible
    try {
      const estimationUrl = formedDebridgeApiUrl.replace("/transaction", "/estimation");
      const estimationResponse = await fetch(estimationUrl);
      let parsedEstimation = await estimationResponse.json();
      parsedEstimation = parsedEstimation.estimation;
      console.log(parsedEstimation);

      if (!estimationResponse.ok) {
        if (
          parsedEstimation.errorMessage?.includes("insufficient liquidity") ||
          parsedEstimation.errorMessage?.includes("no route found")
        ) {
          return `Swap not available: Insufficient liquidity or no route found between these tokens.`;
        }

        if (parsedEstimation.errorMessage?.includes("amount too small")) {
          return `Swap not available: The amount is too small. Please try a larger amount.`;
        }

        console.warn("Estimation failed:", parsedEstimation);
      }
      tokenInDetails = parsedEstimation.tokenIn;
      tokenOutDetails = parsedEstimation.tokenOut;
    } catch (error) {
      console.warn("Error checking swap estimation:", error);
      // Continue even if estimation fails
    }

    const debridgeResponse = await fetch(formedDebridgeApiUrl);
    const transactionData = await debridgeResponse.json();
    console.log(transactionData);

    if (!debridgeResponse.ok || transactionData.errorCode == 0) {
      // Handle specific error cases
      if (
        transactionData.errorMessage?.includes("insufficient liquidity") ||
        transactionData.errorMessage?.includes("no route found")
      ) {
        return `Swap failed: Insufficient liquidity or no route found between these tokens.`;
      }

      if (transactionData.errorMessage?.includes("amount too small")) {
        return `Swap failed: The amount is too small. Please try a larger amount.`;
      }

      if (transactionData.errorMessage?.includes("Bad Request")) {
        return `Swap failed: Invalid request parameters. Please check your token addresses and amount.
        
For BNB Chain (56), make sure:
1. The token amount is not too small (try at least 0.01 USDT)
2. There is sufficient liquidity for this pair
3. You have enough balance of the input token`;
      }

      if (
        transactionData.errorMessage?.includes("transfer amount exceeds allowance") ||
        transactionData.errorMessage?.includes("BEP20: transfer amount exceeds allowance")
      ) {
        return `Swap failed: Token allowance error. You need to approve the swap contract to spend your tokens.
        
Please try again with "approveMax: true" parameter to automatically approve token spending.
Example: "Swap 0.01 USDT to WETH with approveMax: true"`;
      }

      return `Swap failed: ${transactionData.errorMessage || debridgeResponse.statusText}\nDetails: ${JSON.stringify(transactionData.details || {})}`;
    }
    if (!tokenInDetails || !tokenOutDetails) {
      tokenInDetails = transactionData.tokenIn;
      tokenOutDetails = transactionData.tokenOut;
    }

    // If we only got an estimation without transaction data
    if (!transactionData.tx) {
      const inSymbol = tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
      const outSymbol = tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

      return `Swap estimation:\nInput: ${transactionData.tokenIn.amount} ${transactionData.tokenIn.symbol || inSymbol}\nExpected Output: ${transactionData.tokenOut.amount} ${transactionData.tokenOut.symbol || outSymbol}\nMin Output: ${transactionData.tokenOut.minAmount} ${transactionData.tokenOut.symbol || outSymbol}\nRecommended Slippage: ${transactionData.recommendedSlippage}%`;
    }

    // For non-native tokens, we need to check and approve allowance if needed
    if (tokenInAddress !== "0x0000000000000000000000000000000000000000") {
      const spenderAddress = transactionData.tx.to as `0x${string}`;

      // Check and approve token allowance
      const approvalResult = await checkAndApproveTokenAllowance(
        wallet,
        tokenInAddress as `0x${string}`,
        spenderAddress,
        BigInt(formattedAmount),
        args.approveMax,
      );

      if (!approvalResult.success) {
        return `Failed to approve token spending: ${approvalResult.error}`;
      }

      // If we're waiting for confirmation and there was an approval transaction, wait for it
      if (approvalResult.userOpHash) {
        console.log(
          `Waiting for approval transaction ${approvalResult.userOpHash} to be confirmed...`,
        );
        const approvalStatus = await waitForTransaction(wallet, approvalResult.userOpHash);

        if (approvalStatus.status !== "confirmed") {
          return `Token approval failed: ${approvalStatus.error || "Unknown error"}`;
        }

        console.log("Token approval confirmed");
      } else if (approvalResult.userOpHash) {
        console.log(`Token approval submitted with hash: ${approvalResult.userOpHash}`);
      }
    }

    // Now send the swap transaction
    // const tx = {
    //   to: data.tx.to as `0x${string}`,
    //   data: data.tx.data as `0x${string}`,
    //   value: BigInt(data.tx.value || 0),
    // };

    const txResponse = await sendTransaction(wallet, transactionData.tx as Transaction);
    if (!txResponse.success) {
      if (
        typeof txResponse.error === "string" &&
        (txResponse.error.includes("transfer amount exceeds allowance") ||
          txResponse.error.includes("BEP20: transfer amount exceeds allowance"))
      ) {
        return `Swap failed: Token allowance error. You need to approve the swap contract to spend your tokens.
        
Please try again with "approveMax: true" parameter to automatically approve token spending.
Example: "Swap 0.01 USDT to WETH with approveMax: true"`;
      }

      return `Swap failed: ${
        typeof txResponse.error === "string" ? txResponse.error : JSON.stringify(txResponse.error)
      }`;
    }

    const inSymbol =
      transactionData.tokenIn.symbol || tokenInDetails?.symbol || args.tokenInSymbol || "tokens";
    const outSymbol =
      transactionData.tokenOut.symbol || tokenOutDetails?.symbol || args.tokenOutSymbol || "tokens";

    if (args.wait) {
      const status = await waitForTransaction(wallet, txResponse.userOpHash);
      if (status.status === "confirmed") {
        return `Swap completed and confirmed in block ${status.blockNumber}!
Input: ${transactionData.tokenIn.amount} ${inSymbol}
Expected Output: ${transactionData.tokenOut.amount} ${outSymbol}
Transaction Hash: ${status.receipt?.receipt?.transactionHash || txResponse.userOpHash}`;
      } else {
        return `Swap status: ${status.status}
${status.error || ""}
User Operation Hash: ${txResponse.userOpHash}`;
      }
    }

    return `Swap order submitted successfully!
Input: ${transactionData.tokenIn.amount} ${inSymbol}
Expected Output: ${transactionData.tokenOut.amount} ${outSymbol}
User Operation Hash: ${txResponse.userOpHash}

You can either:
1. Check the status by asking: "What's the status of transaction ${txResponse.userOpHash}?"
2. Or next time, add "wait: true" to wait for confirmation, like: "Swap 100 USDC to USDT and wait for confirmation"
3. If you encounter allowance errors, add "approveMax: true" to approve maximum token spending`;
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

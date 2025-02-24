import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../../agentkit";
import { sendTransaction, waitForTransaction } from "../../services";

const SWAP_PROMPT = `
This tool allows you to swap between tokens on the same chain.
Provide the input token address (token you're selling), output token address (token you're buying), and the amount to swap.
`;

export const SmartSwapInput = z
  .object({
    tokenIn: z.string().describe("The address of the input token (token you're selling)"),
    tokenOut: z.string().describe("The address of the output token (token you're buying)"),
    amount: z.string().describe("The amount of input token to swap"),
    wait: z
      .boolean()
      .optional()
      .default(false)
      .describe("Whether to wait for transaction confirmation"),
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

    // Construct the API URL with query parameters
    const baseUrl = "https://dln.debridge.finance/v1.0/chain/transaction";
    const queryParams = new URLSearchParams({
      chainId: chainId.toString(),
      tokenIn: args.tokenIn,
      tokenInAmount: args.amount,
      tokenOut: args.tokenOut,
      tokenOutRecipient: await wallet.getAddress(),
      slippage: "auto",
      affiliateFeePercent: "0",
    });
    const url = `${baseUrl}?${queryParams.toString()}`;
    console.log(url);

    const response = await fetch(url);
    if (!response.ok) {
      // throw new Error(`API request failed: ${response.statusText}`);
      return `Swap failed: ${response.statusText} with url: ${url}`;
    }

    const data = await response.json();
    if (!data.tx) {
      return `Swap estimation:\nInput: ${data.tokenIn.amount} ${data.tokenIn.symbol}\nExpected Output: ${data.tokenOut.amount} ${data.tokenOut.symbol}\nMin Output: ${data.tokenOut.minAmount} ${data.tokenOut.symbol}\nRecommended Slippage: ${data.recommendedSlippage}%`;
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

    if (args.wait) {
      const status = await waitForTransaction(wallet, txResponse.userOpHash);
      if (status.status === "confirmed") {
        return `Swap completed and confirmed in block ${status.blockNumber}!
Input: ${data.tokenIn.amount} ${data.tokenIn.symbol}
Expected Output: ${data.tokenOut.amount} ${data.tokenOut.symbol}`;
      } else {
        return `Swap status: ${status.status}\n${status.error || ""}`;
      }
    }

    return `Swap order submitted successfully!
Input: ${data.tokenIn.amount} ${data.tokenIn.symbol}
Expected Output: ${data.tokenOut.amount} ${data.tokenOut.symbol}
User Operation Hash: ${txResponse.userOpHash}

You can either:
1. Check the status by asking: "What's the status of transaction ${txResponse.userOpHash}?"
2. Or next time, add "wait: true" to wait for confirmation, like: "Swap 100 USDC to USDT and wait for confirmation"`;
  } catch (error) {
    return `Error creating swap order: ${error}`;
  }
}

export class SmartSwapAction implements AgentkitAction<typeof SmartSwapInput> {
  public name = "smart_swap";
  public description = SWAP_PROMPT;
  public argsSchema = SmartSwapInput;
  public func = smartSwap;
  public smartAccountRequired = true;
}

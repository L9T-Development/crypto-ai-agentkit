import { z } from "zod";
import { ZeroXgaslessSmartAccount, Transaction } from "@0xgasless/smart-account";
import { encodeFunctionData, parseEther, parseUnits } from "viem";
import { TokenABI } from "../constants";
import { sendTransaction, waitForTransaction } from "../services";
import { AgentkitAction } from "../agentkit";

const SMART_TRANSFER_PROMPT = `
This tool will transfer an ERC20 token from the wallet to another onchain address using gasless transactions.

It takes the following inputs:
- amount: The amount to transfer
- tokenAddress: The token contract address (use 'eth' for native ETH transfers)
- destination: Where to send the funds (must be a valid onchain address)

Important notes:
- Gasless transfers are only available on supported networks: Avalanche C-Chain, Metis chain, BASE, BNB chain, FANTOM, Moonbeam 
`;

/**
 * Input schema for smart transfer action.
 */
export const SmartTransferInput = z
  .object({
    amount: z.string().describe("The amount of tokens to transfer"),
    tokenAddress: z
      .string()
      .describe("The token contract address or 'eth' for native ETH transfers"),
    destination: z.string().describe("The recipient address"),
    wait: z.boolean().optional().describe("Whether to wait for transaction confirmation"),
  })
  .strip()
  .describe("Instructions for transferring tokens from a smart account to an onchain address");

/**
 * Transfers assets using gasless transactions.
 *
 * @param wallet - The smart account to transfer from.
 * @param args - The input arguments for the action.
 * @returns A message containing the transfer details.
 */
export async function smartTransfer(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof SmartTransferInput>,
): Promise<string> {
  try {
    const isEth = args.tokenAddress.toLowerCase() === "eth";
    let tx: Transaction;

    if (isEth) {
      // Native ETH transfer
      tx = {
        to: args.destination as `0x${string}`,
        data: "0x",
        value: parseEther(args.amount),
      };
    } else {
      // ERC20 token transfer
      const decimals = await wallet.rpcProvider.readContract({
        abi: TokenABI,
        address: args.tokenAddress as `0x${string}`,
        functionName: "decimals",
      });
      const data = encodeFunctionData({
        abi: TokenABI,
        functionName: "transfer",
        args: [
          args.destination as `0x${string}`,
          parseUnits(args.amount, (decimals as number) || 18),
        ],
      });

      tx = {
        to: args.tokenAddress as `0x${string}`,
        data,
        value: 0n,
      };
    }

    const response = await sendTransaction(wallet, tx);
    if (!response || !response.success) {
      return `Transaction failed: ${response?.error || "Unknown error"}`;
    }

    if (args.wait) {
      const status = await waitForTransaction(wallet, response.userOpHash);
      if (status.status === "confirmed") {
        return `Successfully transferred ${args.amount} ${
          isEth ? "ETH" : `tokens from contract ${args.tokenAddress}`
        } to ${args.destination}.\nTransaction confirmed in block ${status.blockNumber}!`;
      } else {
        return `Transaction status: ${status.status}\n${status.error || ""}`;
      }
    }

    return `Successfully submitted transfer of ${args.amount} ${
      isEth ? "ETH" : `tokens from contract ${args.tokenAddress}`
    } to ${args.destination}.\n${response.message}\n\nYou can either:
1. Check the status by asking: 
    - "What's the status of transaction ${response.userOpHash}?"
    - "check for the status of transaction hash above"
2. Or next time, instruct the agent to wait for confirmation, like: "Transfer 1 ETH to 0x... and wait for confirmation"`;
  } catch (error) {
    return `Error transferring the asset: ${error}`;
  }
}

/**
 * Smart transfer action.
 */
export class SmartTransferAction implements AgentkitAction<typeof SmartTransferInput> {
  public name = "smart_transfer";
  public description = SMART_TRANSFER_PROMPT;
  public argsSchema = SmartTransferInput;
  public func = smartTransfer;
  public smartAccountRequired = true;
}

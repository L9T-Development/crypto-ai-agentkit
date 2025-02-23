import {
  ZeroXgaslessSmartAccount,
  Transaction,
  PaymasterMode,
  BalancePayload,
  UserOpResponse,
  UserOpReceipt,
} from "@0xgasless/smart-account";
import { TokenABI } from "./constants";
import { generatePrivateKey } from "viem/accounts";
import { getContract } from "viem";

const DEFAULT_WAIT_INTERVAL = 5000; // 5 seconds
const DEFAULT_MAX_DURATION = 30000; // 30 seconds

export type TokenDetails = {
  name: string;
  symbol: string;
  decimals: bigint;
  address: `0x${string}`;
  chainId: number;
};

export type TransactionStatus = {
  status: "pending" | "confirmed" | "failed";
  receipt?: UserOpReceipt;
  error?: string;
  blockNumber?: number;
  blockConfirmations?: number;
};

export function createWallet() {
  const wallet = generatePrivateKey();
  return wallet;
}

/**
 * Sends a transaction without waiting for confirmation
 * @param wallet The smart account to send the transaction from
 * @param tx The transaction to send
 * @returns The user operation response or false if the request failed
 */
export async function sendTransaction(wallet: ZeroXgaslessSmartAccount, tx: Transaction) {
  try {
    const request = await wallet.sendTransaction(tx, {
      paymasterServiceData: {
        mode: PaymasterMode.SPONSORED,
      },
    });
    if (request.error) {
      return {
        success: false,
        userOpHash: request.userOpHash as string,
        error: request.error,
      };
    }
    // Return the userOpHash immediately with guidance
    return {
      success: true,
      userOpHash: request.userOpHash as string,
      message: `Transaction submitted successfully!\nUser Operation Hash: ${request.userOpHash}\n\nYou can check the transaction status using the 'check_transaction_status' action.`,
    };
  } catch (error) {
    return {
      success: false,
      userOpHash: "",
      error: `Transaction Error: ${error}`,
    };
  }
}

/**
 * Waits for a transaction to be confirmed and returns the status
 * @param wallet The smart account to use for checking status
 * @param userOpHashOrResponse The user operation hash or response object
 * @param options Optional configuration for waiting
 * @returns The transaction status
 */
export async function waitForTransaction(
  wallet: ZeroXgaslessSmartAccount,
  userOpHashOrResponse: string | UserOpResponse,
  options: {
    confirmations?: number;
    maxDuration?: number;
    interval?: number;
  } = {},
): Promise<TransactionStatus> {
  const {
    confirmations = 1,
    maxDuration = DEFAULT_MAX_DURATION,
    interval = DEFAULT_WAIT_INTERVAL,
  } = options;

  // Extract userOpHash from response if needed
  const userOpHash =
    typeof userOpHashOrResponse === "string"
      ? userOpHashOrResponse
      : userOpHashOrResponse.userOpHash;

  let totalDuration = 0;

  return new Promise(resolve => {
    const intervalId = setInterval(async () => {
      try {
        // Get the receipt from bundler
        const bundlerUrl = wallet.bundler?.getBundlerUrl();
        if (!bundlerUrl) {
          throw new Error("Bundler URL not found");
        }
        const response = await fetch(bundlerUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            method: "eth_getUserOperationReceipt",
            params: [userOpHash],
            id: Date.now(),
            jsonrpc: "2.0",
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to fetch receipt: ${response.statusText}`);
        }

        const data = await response.json();
        const receipt = data.result as UserOpReceipt;

        if (receipt?.receipt?.blockNumber) {
          if (confirmations > 1) {
            // Check block confirmations if required
            const latestBlock = await wallet.rpcProvider.getBlockNumber();
            const confirmedBlocks = Number(latestBlock) - receipt.receipt.blockNumber;

            if (confirmedBlocks >= confirmations) {
              clearInterval(intervalId);
              resolve({
                status: "confirmed",
                receipt,
                blockNumber: receipt.receipt.blockNumber,
                blockConfirmations: confirmedBlocks,
              });
              return;
            }
          } else {
            clearInterval(intervalId);
            resolve({
              status: "confirmed",
              receipt,
              blockNumber: receipt.receipt.blockNumber,
              blockConfirmations: 1,
            });
            return;
          }
        }

        // Update duration and check timeout
        totalDuration += interval;
        if (totalDuration >= maxDuration) {
          clearInterval(intervalId);
          resolve({
            status: "pending",
            error: `Exceeded maximum duration (${maxDuration / 1000} sec) waiting for transaction`,
          });
        }
      } catch (error) {
        clearInterval(intervalId);
        resolve({
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error occurred",
        });
      }
    }, interval);
  });
}

export async function getDecimals(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: string,
): Promise<bigint | false> {
  const decimals = (await wallet.rpcProvider.readContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    functionName: "decimals",
  })) as bigint;
  if (!decimals || decimals === BigInt(0)) {
    return false;
  }
  return decimals;
}

export async function getWalletBalance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress?: `0x${string}`[],
): Promise<BalancePayload[] | false> {
  const balance = await wallet.getBalances(tokenAddress);
  if (!balance) {
    return false;
  }
  return balance;
}

export async function fetchTokenDetails(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress: string,
): Promise<TokenDetails | false> {
  const tokenContract = getContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    client: wallet.rpcProvider,
  });
  const name = await tokenContract.read.name();
  const symbol = await tokenContract.read.symbol();
  const decimals = await tokenContract.read.decimals();
  if (!name || !symbol || !decimals) {
    return false;
  }
  return {
    name,
    symbol,
    decimals,
    address: tokenAddress as `0x${string}`,
    chainId: wallet.rpcProvider.chain?.id ?? 0,
  } as TokenDetails;
}

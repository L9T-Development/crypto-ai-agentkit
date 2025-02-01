import {
  ZeroXgaslessSmartAccount,
  Transaction,
  PaymasterMode,
  BalancePayload,
} from "@0xgasless/smart-account";
import { TokenABI } from "./constants";
import { generatePrivateKey } from "viem/accounts";
import { getContract } from "viem";

/**
 * get token details
 * send transcations
 * get wallet balance
 * get decimals
 *
 */

export type TokenDetails = {
  name: string;
  symbol: string;
  decimals: bigint;
  address: `0x${string}`;
  chainId: number;
};

export function createWallet() {
  const wallet = generatePrivateKey();
  return wallet;
}

export async function sendTransaction(wallet: ZeroXgaslessSmartAccount, tx: Transaction) {
  const request = await wallet.sendTransaction(tx, {
    paymasterServiceData: {
      mode: PaymasterMode.SPONSORED,
    },
  });
  if (request.error) {
    return false;
  }
  const txResponse = await request.wait();
  const receipt = await txResponse.receipt;
  return receipt;
}

export async function getDecimals(wallet: ZeroXgaslessSmartAccount, tokenAddress: string) {
  const decimals = (await wallet.rpcProvider.readContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    functionName: "decimals",
  })) as bigint;
  return decimals;
}

export async function getWalletBalance(
  wallet: ZeroXgaslessSmartAccount,
  tokenAddress?: `0x${string}`[],
): Promise<BalancePayload[]> {
  const balance = await wallet.getBalances(tokenAddress);
  return balance;
}

export async function fetchTokenDetails(wallet: ZeroXgaslessSmartAccount, tokenAddress: string) {
  const tokenContract = getContract({
    abi: TokenABI,
    address: tokenAddress as `0x${string}`,
    client: wallet.rpcProvider,
  });
  const name = await tokenContract.read.name();
  const symbol = await tokenContract.read.symbol();
  const decimals = await tokenContract.read.decimals();
  return {
    name,
    symbol,
    decimals,
    address: tokenAddress as `0x${string}`,
    chainId: wallet.rpcProvider.chain?.id ?? 0,
  } as TokenDetails;
}

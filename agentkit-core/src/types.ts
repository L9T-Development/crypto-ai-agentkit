import { UserOpReceipt } from "@0xgasless/smart-account";

export type TransactionResponse = {
  success: boolean;
  userOpHash: string;
  error?: string | { message: string; code: number };
  message?: string;
};

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

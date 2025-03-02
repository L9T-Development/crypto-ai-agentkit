import { z } from "zod";
import { ZeroXgaslessSmartAccount } from "@0xgasless/smart-account";
import { AgentkitAction } from "../agentkit";
import { sendTransaction } from "../services";

const DEBRIDGE_ORDER_PROMPT = `
This tool will create a cross-chain order on the deBridge Liquidity Network (DLN).
It allows users to swap tokens across different chains with the following features:
- Automatic calculation of profitable market rates
- Support for affiliate fees
- Handling of operating expenses
- Cross-chain token swaps

Required parameters:
- Source chain ID and token address (the token you're selling)
- Destination chain ID and token address (the token you're buying)
- Amount of input token and/or desired output token amount
- Recipient address for receiving tokens
- Authority addresses for order management

Note: Orders expire after 30 seconds to ensure market rates remain profitable.
The transaction will be submitted but not waited for - use the returned User Operation Hash to check status.
`;

export const DeBridgeOrderInput = z
  .object({
    srcChainId: z.number().describe("The source chain ID"),
    srcChainTokenIn: z.string().describe("The address of the input token (token you're selling)"),
    srcChainTokenInAmount: z
      .string()
      .describe("The amount of input token, with decimals. Use 'auto' for automatic calculation"),
    dstChainId: z.number().describe("The destination chain ID"),
    dstChainTokenOut: z.string().describe("The address of the output token (token you're buying)"),
    dstChainTokenOutAmount: z
      .string()
      .default("auto")
      .describe("The amount of output token. Recommended to use 'auto'"),
    dstChainTokenOutRecipient: z.string().describe("The address to receive the output tokens"),
    srcChainOrderAuthorityAddress: z
      .string()
      .describe("The address authorized to patch/cancel order on source chain"),
    dstChainOrderAuthorityAddress: z
      .string()
      .describe("The address authorized to patch/cancel order on destination chain"),
    affiliateFeePercent: z.number().optional().describe("Optional affiliate fee percentage"),
    affiliateFeeRecipient: z
      .string()
      .optional()
      .describe("Optional address to receive affiliate fees"),
    prependOperatingExpense: z
      .boolean()
      .default(true)
      .describe("Whether to add operating expenses on top of input amount"),
  })
  .strip()
  .describe("Instructions for creating a cross-chain order on deBridge");

/**
 * Creates a cross-chain order on the deBridge Liquidity Network.
 *
 * @param wallet - The smart account to use for the order.
 * @param args - The input arguments for creating the order.
 * @returns A message containing the order details and transaction info.
 */
export async function createDeBridgeOrder(
  wallet: ZeroXgaslessSmartAccount,
  args: z.infer<typeof DeBridgeOrderInput>,
): Promise<string> {
  try {
    // Construct the API URL with query parameters
    const baseUrl = "https://dln.debridge.finance/v1.0/dln/order/create-tx";
    const queryParams = new URLSearchParams({
      srcChainId: args.srcChainId.toString(),
      srcChainTokenIn: args.srcChainTokenIn,
      srcChainTokenInAmount: args.srcChainTokenInAmount,
      dstChainId: args.dstChainId.toString(),
      dstChainTokenOut: args.dstChainTokenOut,
      dstChainTokenOutAmount: args.dstChainTokenOutAmount,
      dstChainTokenOutRecipient: args.dstChainTokenOutRecipient,
      srcChainOrderAuthorityAddress: args.srcChainOrderAuthorityAddress,
      dstChainOrderAuthorityAddress: args.dstChainOrderAuthorityAddress,
      prependOperatingExpense: args.prependOperatingExpense.toString(),
    });

    // Add optional parameters if provided
    if (args.affiliateFeePercent !== undefined) {
      queryParams.append("affiliateFeePercent", args.affiliateFeePercent.toString());
    }
    if (args.affiliateFeeRecipient) {
      queryParams.append("affiliateFeeRecipient", args.affiliateFeeRecipient);
    }

    const response = await fetch(`${baseUrl}?${queryParams.toString()}`);
    if (!response.ok) {
      throw new Error(`API request failed: ${response.statusText}`);
    }

    const data = await response.json();

    // Execute the transaction if we have tx data
    if (data.tx) {
      const tx = {
        to: data.tx.to as `0x${string}`,
        data: data.tx.data as `0x${string}`,
        value: BigInt(data.tx.value || 0),
      };

      const userOpResponse = await sendTransaction(wallet, tx);
      if (!userOpResponse) {
        return "Failed to submit transaction";
      }

      return `
Order created and transaction submitted!
Order ID: ${data.orderId}
Estimated fulfillment delay: ${data.order.approximateFulfillmentDelay} seconds
User Operation Hash: ${userOpResponse.userOpHash}

Note: The transaction has been submitted but not yet confirmed.
You can check the transaction status using the User Operation Hash.
The order will expire in 30 seconds if not executed.
      `;
    }

    return `
Order estimation:
${JSON.stringify(data.estimation, null, 2)}
Please provide wallet addresses to execute the transaction.
    `;
  } catch (error) {
    return `Error creating deBridge order: ${error}`;
  }
}

/**
 * DeBridge order creation action.
 */
export class DeBridgeOrderAction implements AgentkitAction<typeof DeBridgeOrderInput> {
  public name = "create_debridge_order";
  public description = DEBRIDGE_ORDER_PROMPT;
  public argsSchema = DeBridgeOrderInput;
  public func = createDeBridgeOrder;
  public smartAccountRequired = true;
}

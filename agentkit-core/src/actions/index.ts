import { CreateWalletAction } from "./createWalletAction";
import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { SwapAction } from "./smartSwapAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";

export const AGENTKIT_ACTIONS = [
  new CreateWalletAction(),
  new GetBalanceAction(),
  new SmartTransferAction(),
  new SwapAction(),
  new GetTokenDetailsAction(),
];

// export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
//   return [
//     new GetBalanceAction(),
//     new SmartTransferAction(),
//     new SwapAction(),
//     new CreateWalletAction(),
//     new GetTokenDetailsAction(),
//   ];
// }

// export const AGENTKIT_ACTIONS = getAllAgentkitActions();

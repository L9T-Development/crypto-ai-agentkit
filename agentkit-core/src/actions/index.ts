import { CreateWalletAction } from "./createWalletAction";
import { GetBalanceAction } from "./getBalanceAction";
import { SmartTransferAction } from "./smartTransferAction";
import { GetTokenDetailsAction } from "./getTokenDetailsAction";
import { CheckTransactionAction } from "./checkTransactionAction";
import { AgentkitAction, ActionSchemaAny } from "../agentkit";

export function getAllAgentkitActions(): AgentkitAction<ActionSchemaAny>[] {
  return [
    new CreateWalletAction(),
    new GetBalanceAction(),
    new SmartTransferAction(),
    new GetTokenDetailsAction(),
    new CheckTransactionAction(),
  ];
}

export const AGENTKIT_ACTIONS = getAllAgentkitActions();

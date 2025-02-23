# 0xgasless AgentKit Langchain Extension Examples - Chatbot Typescript

This example demonstrates an agent setup as a terminal style chatbot with access to the full set of 0xgasless AgentKit actions.

## Ask the chatbot to engage in the Web3 ecosystem!

- "Transfer a portion of your ETH to john2879.base.eth"
- "Deploy an NFT that will go super viral!"
- "Choose a name for yourself and register a Basename for your wallet"
- "Deploy an ERC-20 token with total supply 1 billion"

## Requirements

- [Bun](https://bun.sh/docs/installation)
- [0xgasless API Key](https://dashboard.0xgasless.com/)
- [OpenAI API Key](https://platform.openai.com/docs/quickstart#create-and-export-an-api-key)

## Installation

```bash
bun install
```

## Run the Chatbot

### Set ENV Vars
<!-- OPENROUTER_API_KEY=
PRIVATE_KEY=
CHAIN_ID=
RPC_URL=
API_KEY= -->

- Ensure the following ENV Vars are set:
  - "0XGASLESS_API_KEY"
  - "OPENAI_API_KEY"
  - "OPENROUTER_API_KEY"
  - "PRIVATE_KEY"
  - "CHAIN_ID"
  - "RPC_URL"
  - "API_KEY"

```bash
bun run index.ts
```

## License

MIT
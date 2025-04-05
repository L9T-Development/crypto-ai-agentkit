<div align="center">
  <h1 style="font-size: 3em; margin-bottom: 20px;">
    0xTan1319 AgentKit
  </h1>

  <p style="font-size: 1.2em; max-width: 600px; margin: 0 auto 20px;">
    This AgentKit lets you build AI agents that can trade, manage funds, and interact with DeFi protocols in natural language.
  </p>

</div>

## Key Features

- **Framework-agnostic**: Common AI Agent primitives that can be used with any AI framework.
- **Python and Node.js Support**
- **Support for various onchain actions**:

  - Getting wallet details and balances
  - Transferring and trading tokens


## Repository Structure


```
./
├── agentkit-core/
│   ├── python/
│   └── typescript/
├── agentkit-langchain/
│   ├── python/
│   ├── typescript/
│   └── examples/
```

### agentkit-core

Core primitives and framework-agnostic tools that are meant to be composable and used via AgentKit framework extensions (ie, `agentkit-langchain`).
See [AgentKit Core](./agentkit-core/README.md) to get started!

### agentkit-langchain

Langchain Toolkit extension of AgentKit. Enables agentic workflows to interact with onchain actions.
See [AgentKit Langchain](./agentkit-langchain/README.md) to get started!

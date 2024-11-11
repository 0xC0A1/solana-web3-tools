# Solana Web3 Tools

A collection of helpful tools for building Solana web3 applications.

## Installation

```bash
pnpm add @kevinrodriguez-io/solana-web3-tools
```

## Features

- `SmartInstructionSender`: Sends instruction sets as transactions to the Solana network, handling re-signing and slot exhaustion. Retries failed transactions and rebuilds them with new blockhashes when needed.
- More features to be added...

## Usage

### SmartInstructionSender

```typescript
import { SmartInstructionSender } from '@kevinrodriguez-io/solana-web3-tools';

const sendInstructions = async (
  instructions: TransactionInstruction[][],
  signers: Signer[][]
) => {
  const sender = SmartInstructionSender
    .build(wallet, connection)
    .config({
      maxSigningAttempts: 3,
      abortOnFailure: true,
      commitment: 'confirmed',
    })
    .withInstructionSets(instructions.map((ixs, i) => ({
      instructions: ixs,
      signers: signers[i]
    })))
    .onProgress((index, txId) => {
      console.log(`Transaction sent: ${index}, TxID: ${txId}`);
    })
    .onFailure((error, successfulItems, currentIndex, instructionSet) => {
      console.error(`Error: ${error.message}`);
      console.log(`Successful items: ${successfulItems}`);
      console.log(`Current index: ${currentIndex}`);
      console.log(`Failed instruction set: ${JSON.stringify(instructionSet)}`);
    })
    .onReSign((attempt, index) => {
      console.warn(`Re-signing: ${index}, Attempt: ${attempt}`);
    });

  await sender.send();
};
```

## API

### SmartInstructionSender

#### `build(wallet: WalletSigner, connection: Connection)`
Creates a new `SmartInstructionSender` instance.

#### `config(config: SmartInstructionSenderConfiguration)`
Sets the configuration for the `SmartInstructionSender`.

#### `withInstructionSets(instructionSets: InstructionSet[])`  
Sets the instruction sets to be processed.

#### `onProgress(callback: ProgressCb)`
Sets the progress callback, which is called when a transaction is sent successfully.

#### `onReSign(callback: ReSignCb)` 
Sets the re-sign callback, which is called when a transaction needs to be re-signed.

#### `onFailure(callback: FailureCb)`
Sets the failure callback, which is called when a transaction fails to be sent after the specified number of attempts.

#### `send()`
Sends the instruction sets as transactions.

## Contributing

Contributions are welcome! Please read our [contributing guidelines](CONTRIBUTING.md) to get started.

## License

This project is licensed under the [MIT License](LICENSE).
import {
  Commitment,
  Connection,
  Transaction,
  PublicKey,
} from '@solana/web3.js';
import retry from 'async-retry';
import { sendSignedTransaction } from './tools/connectionTools';
import { getSlotAndCurrentBlockHash } from './tools';
import { InstructionSet } from './types';

export interface WalletSigner {
  publicKey: PublicKey | null;
  signAllTransactions: (transaction: Transaction[]) => Promise<Transaction[]>;
}

/**
 * Callback for when a transaction is sent to the network correctly.
 */
export type ProgressCb = (currentIndex: number, txId: string) => void;

/**
 * Callback for when a transaction needs to be re-signed.
 */
export type ReSignCb = (attempt: number, currentIndex: number) => void;

/**
 * Callback for when a transaction fails to be sent after attempts.
 */
export type FailureCb = (
  error: Error | unknown,
  successfulItems: number,
  currentIndex: number,
  instructionSet: InstructionSet,
) => void;

/**
 * Configuration for the smart instruction sender.
 */
export interface SmartInstructionSenderConfiguration {
  maxSigningAttempts: number;
  abortOnFailure: boolean;
  commitment: Commitment;
}

/**
 * Sends instruction sets as transactions to the Solana network, handling re-signing
 * and slot exhaustion. Retries failed transactions and rebuilds them with new blockhashes
 * when needed.
 */
export class SmartInstructionSender {
  private configuration: SmartInstructionSenderConfiguration = {
    maxSigningAttempts: 3,
    abortOnFailure: true,
    commitment: 'singleGossip',
  };

  private onProgressCallback?: ProgressCb;
  private onReSignCallback?: ReSignCb;
  private onFailureCallback?: FailureCb;

  private constructor(
    private wallet: WalletSigner,
    private connection: Connection,
    private instructionSets?: InstructionSet[],
  ) {}

  /**
   * Creates a new SmartInstructionSender instance
   */
  public static build = (
    wallet: WalletSigner,
    connection: Connection,
  ): SmartInstructionSender => new SmartInstructionSender(wallet, connection);

  /**
   * Sets the configuration
   */
  public config = (
    config: SmartInstructionSenderConfiguration,
  ): SmartInstructionSender => {
    this.configuration = config;
    return this;
  };

  /**
   * Sets instruction sets to be processed
   */
  public withInstructionSets = (
    instructionSets: InstructionSet[],
  ): SmartInstructionSender => {
    this.instructionSets = instructionSets;
    return this;
  };

  /**
   * Sets progress callback
   */
  public onProgress = (
    progressCallback: ProgressCb,
  ): SmartInstructionSender => {
    this.onProgressCallback = progressCallback;
    return this;
  };

  /**
   * Sets re-sign callback
   */
  public onReSign = (reSignCallback: ReSignCb): SmartInstructionSender => {
    this.onReSignCallback = reSignCallback;
    return this;
  };

  /**
   * Sets failure callback
   */
  public onFailure = (onFailureCallback: FailureCb): SmartInstructionSender => {
    this.onFailureCallback = onFailureCallback;
    return this;
  };

  /**
   * Rebuilds and signs transactions from given index
   */
  private signAndRebuildTransactionsFromInstructionSets = async (
    signedTXs: Transaction[],
    index: number,
    blockhash: { blockhash: string; lastValidBlockHeight: number },
    attempt = 0,
  ): Promise<Transaction> => {
    this.onReSignCallback?.(attempt, index);

    const txsToRebuild = this.instructionSets!.slice(index).map(
      (instructionSet) => {
        const tx = new Transaction({
          feePayer: this.wallet!.publicKey,
          blockhash: blockhash.blockhash,
          lastValidBlockHeight: blockhash.lastValidBlockHeight,
        }).add(...instructionSet.instructions);

        if (instructionSet.signers.length) {
          tx.partialSign(...instructionSet.signers);
        }
        return tx;
      },
    );

    const signedSlice = await this.wallet!.signAllTransactions(txsToRebuild);
    signedTXs.splice(index, signedSlice.length, ...signedSlice);

    return signedSlice[0];
  };

  /**
   * Sends instruction sets as transactions
   */
  public send = async (): Promise<void> => {
    if (!this.wallet?.publicKey) throw new Error('WALLET_NOT_CONNECTED');
    if (!this.instructionSets?.length) throw new Error('NO_INSTRUCTION_SETS');

    let [slot, currentBlock] = await getSlotAndCurrentBlockHash(
      this.connection,
      this.configuration.commitment,
    );

    const unsignedTXs = this.instructionSets
      .filter((i) => i.instructions.length)
      .map(({ instructions, signers }) => {
        const tx = new Transaction({
          feePayer: this.wallet!.publicKey,
          blockhash: currentBlock.blockhash,
          lastValidBlockHeight: currentBlock.lastValidBlockHeight,
        }).add(...instructions);

        if (signers.length) tx.partialSign(...signers);
        return tx;
      });

    const signedTXs = await this.wallet.signAllTransactions(unsignedTXs);
    let successfulItems = 0;

    const processTx = async (tx: Transaction, i: number): Promise<void> => {
      const result = await sendSignedTransaction({
        connection: this.connection!,
        signedTransaction: tx,
      });

      if (result.err) {
        throw result.err;
      }

      this.onProgressCallback?.(i, result.txid!);
      successfulItems++;

      if (result.slot! >= slot + 150) {
        const nextTXs = signedTXs.slice(i + 1);
        if (nextTXs.length) {
          [slot, currentBlock] = await getSlotAndCurrentBlockHash(
            this.connection,
            this.configuration.commitment,
          );
          await this.signAndRebuildTransactionsFromInstructionSets(
            signedTXs,
            i + 1,
            currentBlock,
          );
        }
      }
    };

    for (let i = 0; i < signedTXs.length; i++) {
      let tx = signedTXs[i];
      let retryNumber = 0;

      try {
        await retry(
          async (bail) => {
            retryNumber++;
            try {
              await processTx(tx, i);
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } catch (error: any) {
              if (error === 'timeout') {
                if (retryNumber >= this.configuration!.maxSigningAttempts) {
                  bail(new Error('MAX_RESIGN_ATTEMPTS_REACHED'));
                }
                throw error;
              }
              bail(error);
            }
          },
          {
            retries: this.configuration.maxSigningAttempts,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onRetry: async (error: any, attempt: number) => {
              if (error === 'timeout') {
                const slotResult = await this.connection!.getSlot(
                  this.configuration.commitment,
                );
                if (slotResult >= slot + 150) {
                  [slot, currentBlock] = await getSlotAndCurrentBlockHash(
                    this.connection,
                    this.configuration.commitment,
                  );
                  tx = await this.signAndRebuildTransactionsFromInstructionSets(
                    signedTXs,
                    i,
                    currentBlock,
                    attempt,
                  );
                }
              }
            },
          },
        );
      } catch (error) {
        this.onFailureCallback?.(
          error,
          i,
          successfulItems,
          this.instructionSets[successfulItems - 1],
        );
        if (this.configuration.abortOnFailure) break;
      }
    }
  };
}

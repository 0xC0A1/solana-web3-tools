import { Commitment, Connection, Transaction, PublicKey } from '@solana/web3.js';
import { InstructionSet } from './types';
export type WalletSigner = {
    publicKey: PublicKey | null;
    signAllTransactions: (transaction: Transaction[]) => Promise<Transaction[]>;
};
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
export type FailureCb = (error: Error | any, successfulItems: number, currentIndex: number, instructionSet: InstructionSet) => void;
/**
 * Configuration for the smart instruction sender.
 */
export type SmartInstructionSenderConfiguration = {
    maxSigningAttempts: number;
    abortOnFailure: boolean;
    commitment: Commitment;
};
/**
 * Sends instruction sets as transactions to the Solana network, handling re-signing
 * and slot exhaustion. Retries failed transactions and rebuilds them with new blockhashes
 * when needed.
 */
export declare class SmartInstructionSender {
    private wallet;
    private connection;
    private instructionSets?;
    private configuration;
    private onProgressCallback?;
    private onReSignCallback?;
    private onFailureCallback?;
    private constructor();
    /**
     * Creates a new SmartInstructionSender instance
     */
    static build: (wallet: WalletSigner, connection: Connection) => SmartInstructionSender;
    /**
     * Sets the configuration
     */
    config: (config: SmartInstructionSenderConfiguration) => this;
    /**
     * Sets instruction sets to be processed
     */
    withInstructionSets: (instructionSets: InstructionSet[]) => this;
    /**
     * Sets progress callback
     */
    onProgress: (progressCallback: ProgressCb) => this;
    /**
     * Sets re-sign callback
     */
    onReSign: (reSignCallback: ReSignCb) => this;
    /**
     * Sets failure callback
     */
    onFailure: (onFailureCallback: FailureCb) => this;
    /**
     * Rebuilds and signs transactions from given index
     */
    private signAndRebuildTransactionsFromInstructionSets;
    /**
     * Sends instruction sets as transactions
     */
    send: () => Promise<void>;
}

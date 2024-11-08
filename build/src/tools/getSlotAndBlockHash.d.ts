import { Commitment, Connection } from '@solana/web3.js';
export declare const getSlotAndCurrentBlockHash: (connection: Connection, commitment: Commitment) => Promise<[number, Readonly<{
    blockhash: import("@solana/web3.js").Blockhash;
    lastValidBlockHeight: number;
}>]>;

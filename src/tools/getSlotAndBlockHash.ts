import { Commitment, Connection } from '@solana/web3.js';
import { SlotAndBlockHashTuple } from '../types';

/**
 * Gets the current slot and blockhash information from the Solana network
 * @param connection - The Solana RPC connection to use
 * @param commitment - The commitment level to use for the queries
 * @returns A promise that resolves to a tuple containing:
 *          - The current slot number
 *          - An object with the current blockhash and last valid block height
 */
export const getSlotAndCurrentBlockHash = (
  connection: Connection,
  commitment: Commitment,
): Promise<SlotAndBlockHashTuple> =>
  Promise.all([
    connection.getSlot(commitment),
    connection.getLatestBlockhash(commitment),
  ]);

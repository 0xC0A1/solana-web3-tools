import {
  ConfirmOptions,
  Connection,
  Transaction,
  TransactionError,
  TransactionSignature,
} from '@solana/web3.js';

/**
 * Possible errors that can occur when sending and confirming a transaction
 */
export interface SendAndConfirmError {
  /** The type of error that occurred */
  type: 'tx-error' | 'timeout' | 'misc-error';
  /** The underlying error object */
  inner: TransactionError | unknown;
  /** The transaction signature, if one was generated */
  txid?: TransactionSignature;
}

/**
 * Result of sending a signed transaction
 */
export interface SendSignedTransactionResult {
  /** The transaction signature if successful */
  txid?: string;
  /** The slot number when the transaction was confirmed */
  slot?: number;
  /** Any error that occurred */
  err?: SendAndConfirmError;
}

/**
 * Sends and confirms a raw transaction with enhanced error handling
 * @param connection - The Solana RPC connection
 * @param rawTransaction - The serialized transaction
 * @param options - Optional confirmation options
 * @returns The transaction signature on success, or error details on failure
 */
export async function sendAndConfirmRawTransactionEx(
  connection: Connection,
  rawTransaction: Buffer,
  options?: ConfirmOptions,
): Promise<
  | { ok: TransactionSignature; err?: undefined }
  | { ok?: undefined; err: SendAndConfirmError }
> {
  let txid: string | undefined;

  try {
    // Prepare send options, using provided options or defaults
    const sendOptions: ConfirmOptions | undefined = options && {
      skipPreflight: options.skipPreflight,
      preflightCommitment: options.preflightCommitment || options.commitment,
    };

    // Send the raw transaction
    txid = await connection.sendRawTransaction(rawTransaction, sendOptions);

    // Wait for confirmation
    const status = (
      await connection.confirmTransaction(txid, options?.commitment)
    ).value;

    // Check for transaction errors
    if (status.err) {
      return { err: { type: 'tx-error', inner: status.err, txid } };
    }

    return { ok: txid };
  } catch (e: unknown) {
    // Handle timeout errors separately from other errors
    const isTimeout =
      e instanceof Error &&
      e.message.includes('Transaction was not confirmed in');

    return {
      err: {
        type: isTimeout ? 'timeout' : 'misc-error',
        inner: e,
        txid,
      },
    };
  }
}

/**
 * Sends a signed transaction and waits for confirmation
 * @param params.signedTransaction - The signed transaction to send
 * @param params.connection - The Solana RPC connection
 * @returns Transaction signature and slot number on success, or error details on failure
 */
export async function sendSignedTransaction({
  signedTransaction,
  connection,
}: {
  signedTransaction: Transaction;
  connection: Connection;
}): Promise<SendSignedTransactionResult> {
  // Serialize the signed transaction
  const rawTransaction = signedTransaction.serialize();
  let slot = 0;

  // Send and confirm the transaction
  const result = await sendAndConfirmRawTransactionEx(
    connection,
    rawTransaction,
    {
      skipPreflight: true,
      commitment: 'confirmed',
    },
  );

  // Return early if there was an error
  if (result.err) return { err: result.err };

  const { ok: txid } = result;

  // Get the confirmed transaction details
  const confirmation = await connection.getTransaction(txid, {
    commitment: 'confirmed',
    maxSupportedTransactionVersion: 0,
  });

  if (confirmation) {
    slot = confirmation.slot;
  }

  return { txid, slot };
}

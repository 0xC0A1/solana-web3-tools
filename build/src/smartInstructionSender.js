"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SmartInstructionSender = void 0;
const web3_js_1 = require("@solana/web3.js");
const async_retry_1 = __importDefault(require("async-retry"));
const connectionTools_1 = require("./tools/connectionTools");
const tools_1 = require("./tools");
/**
 * Sends instruction sets as transactions to the Solana network, handling re-signing
 * and slot exhaustion. Retries failed transactions and rebuilds them with new blockhashes
 * when needed.
 */
class SmartInstructionSender {
    constructor(wallet, connection, instructionSets) {
        this.wallet = wallet;
        this.connection = connection;
        this.instructionSets = instructionSets;
        this.configuration = {
            maxSigningAttempts: 3,
            abortOnFailure: true,
            commitment: 'singleGossip',
        };
        /**
         * Sets the configuration
         */
        this.config = (config) => {
            this.configuration = config;
            return this;
        };
        /**
         * Sets instruction sets to be processed
         */
        this.withInstructionSets = (instructionSets) => {
            this.instructionSets = instructionSets;
            return this;
        };
        /**
         * Sets progress callback
         */
        this.onProgress = (progressCallback) => {
            this.onProgressCallback = progressCallback;
            return this;
        };
        /**
         * Sets re-sign callback
         */
        this.onReSign = (reSignCallback) => {
            this.onReSignCallback = reSignCallback;
            return this;
        };
        /**
         * Sets failure callback
         */
        this.onFailure = (onFailureCallback) => {
            this.onFailureCallback = onFailureCallback;
            return this;
        };
        /**
         * Rebuilds and signs transactions from given index
         */
        this.signAndRebuildTransactionsFromInstructionSets = (signedTXs_1, index_1, blockhash_1, ...args_1) => __awaiter(this, [signedTXs_1, index_1, blockhash_1, ...args_1], void 0, function* (signedTXs, index, blockhash, attempt = 0) {
            var _a;
            (_a = this.onReSignCallback) === null || _a === void 0 ? void 0 : _a.call(this, attempt, index);
            const txsToRebuild = this.instructionSets.slice(index).map((instructionSet) => {
                const tx = new web3_js_1.Transaction({
                    feePayer: this.wallet.publicKey,
                    blockhash: blockhash.blockhash,
                    lastValidBlockHeight: blockhash.lastValidBlockHeight,
                }).add(...instructionSet.instructions);
                if (instructionSet.signers.length) {
                    tx.partialSign(...instructionSet.signers);
                }
                return tx;
            });
            const signedSlice = yield this.wallet.signAllTransactions(txsToRebuild);
            signedTXs.splice(index, signedSlice.length, ...signedSlice);
            return signedSlice[0];
        });
        /**
         * Sends instruction sets as transactions
         */
        this.send = () => __awaiter(this, void 0, void 0, function* () {
            var _a, _b, _c;
            if (!((_a = this.wallet) === null || _a === void 0 ? void 0 : _a.publicKey))
                throw new Error('WALLET_NOT_CONNECTED');
            if (!((_b = this.instructionSets) === null || _b === void 0 ? void 0 : _b.length))
                throw new Error('NO_INSTRUCTION_SETS');
            let [slot, currentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
            const unsignedTXs = this.instructionSets
                .filter((i) => i.instructions.length)
                .map(({ instructions, signers }) => {
                const tx = new web3_js_1.Transaction({
                    feePayer: this.wallet.publicKey,
                    blockhash: currentBlock.blockhash,
                    lastValidBlockHeight: currentBlock.lastValidBlockHeight,
                }).add(...instructions);
                if (signers.length)
                    tx.partialSign(...signers);
                return tx;
            });
            const signedTXs = yield this.wallet.signAllTransactions(unsignedTXs);
            let successfulItems = 0;
            const processTx = (tx, i) => __awaiter(this, void 0, void 0, function* () {
                var _a;
                const result = yield (0, connectionTools_1.sendSignedTransaction)({
                    connection: this.connection,
                    signedTransaction: tx,
                });
                if (result.err) {
                    throw result.err;
                }
                (_a = this.onProgressCallback) === null || _a === void 0 ? void 0 : _a.call(this, i, result.txid);
                successfulItems++;
                if (result.slot >= slot + 150) {
                    const nextTXs = signedTXs.slice(i + 1);
                    if (nextTXs.length) {
                        [slot, currentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
                        yield this.signAndRebuildTransactionsFromInstructionSets(signedTXs, i + 1, currentBlock);
                    }
                }
            });
            for (let i = 0; i < signedTXs.length; i++) {
                let tx = signedTXs[i];
                let retryNumber = 0;
                try {
                    yield (0, async_retry_1.default)((bail) => __awaiter(this, void 0, void 0, function* () {
                        retryNumber++;
                        try {
                            yield processTx(tx, i);
                        }
                        catch (error) {
                            if (error.type === 'timeout') {
                                if (retryNumber >= this.configuration.maxSigningAttempts) {
                                    bail(new Error('MAX_RESIGN_ATTEMPTS_REACHED'));
                                }
                                throw error;
                            }
                            bail(error);
                        }
                    }), {
                        retries: this.configuration.maxSigningAttempts,
                        onRetry: (error, attempt) => __awaiter(this, void 0, void 0, function* () {
                            if ((error === null || error === void 0 ? void 0 : error.type) === 'timeout') {
                                const slotResult = yield this.connection.getSlot(this.configuration.commitment);
                                if (slotResult >= slot + 150) {
                                    [slot, currentBlock] = yield (0, tools_1.getSlotAndCurrentBlockHash)(this.connection, this.configuration.commitment);
                                    tx = yield this.signAndRebuildTransactionsFromInstructionSets(signedTXs, i, currentBlock, attempt);
                                }
                            }
                        }),
                    });
                }
                catch (error) {
                    (_c = this.onFailureCallback) === null || _c === void 0 ? void 0 : _c.call(this, error, i, successfulItems, this.instructionSets[successfulItems - 1]);
                    if (this.configuration.abortOnFailure)
                        break;
                }
            }
        });
    }
}
exports.SmartInstructionSender = SmartInstructionSender;
/**
 * Creates a new SmartInstructionSender instance
 */
SmartInstructionSender.build = (wallet, connection) => new SmartInstructionSender(wallet, connection);

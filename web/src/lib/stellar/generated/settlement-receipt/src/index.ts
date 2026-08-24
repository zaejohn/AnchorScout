import { Buffer } from "buffer";
import { Address } from "@stellar/stellar-sdk";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Result,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type {
  u32,
  i32,
  u64,
  i64,
  u128,
  i128,
  u256,
  i256,
  Option,
  Timepoint,
  Duration,
} from "@stellar/stellar-sdk/contract";
export * from "@stellar/stellar-sdk";
export * as contract from "@stellar/stellar-sdk/contract";
export * as rpc from "@stellar/stellar-sdk/rpc";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}


export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CBQKALTRUEBNTDOKL7UOOSEFPJMHZRQCWV5C6VZA4T3TO4WEB2OIBDJM",
  }
} as const

export const SettlementError = {
  1: {message:"InvalidStatus"},
  2: {message:"DuplicateReceipt"},
  3: {message:"RouteUserMismatch"},
  4: {message:"ReceiptNotFound"}
}

export type SettlementStatus = {tag: "Completed", values: void} | {tag: "Failed", values: void};



export interface SettlementReceiptRecord {
  completed_at: u64;
  receipt_id: Buffer;
  route_id: Buffer;
  status: SettlementStatus;
  transaction_hash: Buffer;
  user: string;
}

export interface Client {
  /**
   * Construct and simulate a get_receipt transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_receipt: ({route_id}: {route_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<SettlementReceiptRecord>>

  /**
   * Construct and simulate a record_outcome transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  record_outcome: ({receipt_id, route_id, user, transaction_hash, status_code}: {receipt_id: Buffer, route_id: Buffer, user: string, transaction_hash: Buffer, status_code: u32}, options?: MethodOptions) => Promise<AssembledTransaction<SettlementReceiptRecord>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {registry}: {registry: string},
    /** Options for initializing a Client as well as for calling a method, with extras specific to deploying. */
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        /** The hash of the Wasm blob, which must already be installed on-chain. */
        wasmHash: Buffer | string;
        /** Salt used to generate the contract's ID. Passed through to {@link Operation.createCustomContract}. Default: random. */
        salt?: Buffer | Uint8Array;
        /** The format used to decode `wasmHash`, if it's provided as a string. */
        format?: "hex" | "base64";
      }
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy({registry}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAAD1NldHRsZW1lbnRFcnJvcgAAAAAEAAAAAAAAAA1JbnZhbGlkU3RhdHVzAAAAAAAAAQAAAAAAAAAQRHVwbGljYXRlUmVjZWlwdAAAAAIAAAAAAAAAEVJvdXRlVXNlck1pc21hdGNoAAAAAAAAAwAAAAAAAAAPUmVjZWlwdE5vdEZvdW5kAAAAAAQ=",
        "AAAAAgAAAAAAAAAAAAAAEFNldHRsZW1lbnRTdGF0dXMAAAACAAAAAAAAAAAAAAAJQ29tcGxldGVkAAAAAAAAAAAAAAAAAAAGRmFpbGVkAAA=",
        "AAAABQAAAAAAAAAAAAAAElNldHRsZW1lbnRSZWNvcmRlZAAAAAAAAQAAABNzZXR0bGVtZW50X3JlY29yZGVkAAAAAAYAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAACnJlY2VpcHRfaWQAAAAAA+4AAAAgAAAAAAAAAAAAAAAQdHJhbnNhY3Rpb25faGFzaAAAA+4AAAAgAAAAAAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAEFNldHRsZW1lbnRTdGF0dXMAAAAAAAAAAAAAAAxjb21wbGV0ZWRfYXQAAAAGAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAALZ2V0X3JlY2VpcHQAAAAAAQAAAAAAAAAIcm91dGVfaWQAAAPuAAAAIAAAAAEAAAfQAAAAF1NldHRsZW1lbnRSZWNlaXB0UmVjb3JkAA==",
        "AAAAAQAAAAAAAAAAAAAAF1NldHRsZW1lbnRSZWNlaXB0UmVjb3JkAAAAAAYAAAAAAAAADGNvbXBsZXRlZF9hdAAAAAYAAAAAAAAACnJlY2VpcHRfaWQAAAAAA+4AAAAgAAAAAAAAAAhyb3V0ZV9pZAAAA+4AAAAgAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAAQU2V0dGxlbWVudFN0YXR1cwAAAAAAAAAQdHJhbnNhY3Rpb25faGFzaAAAA+4AAAAgAAAAAAAAAAR1c2VyAAAAEw==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAACHJlZ2lzdHJ5AAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAOcmVjb3JkX291dGNvbWUAAAAAAAUAAAAAAAAACnJlY2VpcHRfaWQAAAAAA+4AAAAgAAAAAAAAAAhyb3V0ZV9pZAAAA+4AAAAgAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAQdHJhbnNhY3Rpb25faGFzaAAAA+4AAAAgAAAAAAAAAAtzdGF0dXNfY29kZQAAAAAEAAAAAQAAB9AAAAAXU2V0dGxlbWVudFJlY2VpcHRSZWNvcmQA" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_receipt: this.txFromJSON<SettlementReceiptRecord>,
        record_outcome: this.txFromJSON<SettlementReceiptRecord>
  }
}
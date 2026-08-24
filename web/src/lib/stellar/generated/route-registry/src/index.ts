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




export const RouteError = {
  1: {message:"InvalidAmount"},
  2: {message:"InvalidText"},
  3: {message:"DuplicateRoute"},
  4: {message:"RouteNotFound"},
  5: {message:"InvalidTransition"},
  6: {message:"SettlementNotConfigured"},
  7: {message:"UserMismatch"},
  8: {message:"InvalidPage"}
}


export interface RouteRecord {
  anchor_id: string;
  destination_amount: i128;
  destination_currency: string;
  fee: i128;
  quote_hash: Buffer;
  route_id: Buffer;
  selected_at: u64;
  source_amount: i128;
  source_asset: string;
  status: RouteStatus;
  transaction_hash: Option<Buffer>;
  user: string;
}

export type RouteStatus = {tag: "Pending", values: void} | {tag: "Completed", values: void} | {tag: "Failed", values: void};




export interface Client {
  /**
   * Construct and simulate a get_route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_route: ({route_id}: {route_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<RouteRecord>>

  /**
   * Construct and simulate a create_route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  create_route: ({route_id, user, anchor_id, source_asset, source_amount, destination_currency, destination_amount, fee, quote_hash}: {route_id: Buffer, user: string, anchor_id: string, source_asset: string, source_amount: i128, destination_currency: string, destination_amount: i128, fee: i128, quote_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<RouteRecord>>

  /**
   * Construct and simulate a finalize_route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  finalize_route: ({route_id, user, status_code, transaction_hash}: {route_id: Buffer, user: string, status_code: u32, transaction_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_route_user transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_route_user: ({route_id}: {route_id: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<string>>

  /**
   * Construct and simulate a get_user_routes transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_user_routes: ({user, cursor, limit}: {user: string, cursor: u32, limit: u32}, options?: MethodOptions) => Promise<AssembledTransaction<Array<RouteRecord>>>

  /**
   * Construct and simulate a configure_settlement transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  configure_settlement: ({settlement_contract}: {settlement_contract: string}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a get_user_route_count transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  get_user_route_count: ({user}: {user: string}, options?: MethodOptions) => Promise<AssembledTransaction<u32>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {admin}: {admin: string},
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
    return ContractClient.deploy({admin}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABAAAAAAAAAAAAAAAClJvdXRlRXJyb3IAAAAAAAgAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAABAAAAAAAAAAtJbnZhbGlkVGV4dAAAAAACAAAAAAAAAA5EdXBsaWNhdGVSb3V0ZQAAAAAAAwAAAAAAAAANUm91dGVOb3RGb3VuZAAAAAAAAAQAAAAAAAAAEUludmFsaWRUcmFuc2l0aW9uAAAAAAAABQAAAAAAAAAXU2V0dGxlbWVudE5vdENvbmZpZ3VyZWQAAAAABgAAAAAAAAAMVXNlck1pc21hdGNoAAAABwAAAAAAAAALSW52YWxpZFBhZ2UAAAAACA==",
        "AAAAAQAAAAAAAAAAAAAAC1JvdXRlUmVjb3JkAAAAAAwAAAAAAAAACWFuY2hvcl9pZAAAAAAAABAAAAAAAAAAEmRlc3RpbmF0aW9uX2Ftb3VudAAAAAAACwAAAAAAAAAUZGVzdGluYXRpb25fY3VycmVuY3kAAAAQAAAAAAAAAANmZWUAAAAACwAAAAAAAAAKcXVvdGVfaGFzaAAAAAAD7gAAACAAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAAAAAAAC3NlbGVjdGVkX2F0AAAAAAYAAAAAAAAADXNvdXJjZV9hbW91bnQAAAAAAAALAAAAAAAAAAxzb3VyY2VfYXNzZXQAAAAQAAAAAAAAAAZzdGF0dXMAAAAAB9AAAAALUm91dGVTdGF0dXMAAAAAAAAAABB0cmFuc2FjdGlvbl9oYXNoAAAD6AAAA+4AAAAgAAAAAAAAAAR1c2VyAAAAEw==",
        "AAAAAgAAAAAAAAAAAAAAC1JvdXRlU3RhdHVzAAAAAAMAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAACUNvbXBsZXRlZAAAAAAAAAAAAAAAAAAABkZhaWxlZAAA",
        "AAAABQAAAAAAAAAAAAAADVJvdXRlU2VsZWN0ZWQAAAAAAAABAAAADnJvdXRlX3NlbGVjdGVkAAAAAAAFAAAAAAAAAAhyb3V0ZV9pZAAAA+4AAAAgAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAAAAAAAAlhbmNob3JfaWQAAAAAAAAQAAAAAAAAAAAAAAANc291cmNlX2Ftb3VudAAAAAAAAAsAAAAAAAAAAAAAAAtzZWxlY3RlZF9hdAAAAAAGAAAAAAAAAAI=",
        "AAAAAAAAAAAAAAAJZ2V0X3JvdXRlAAAAAAAAAQAAAAAAAAAIcm91dGVfaWQAAAPuAAAAIAAAAAEAAAfQAAAAC1JvdXRlUmVjb3JkAA==",
        "AAAAAAAAAAAAAAAMY3JlYXRlX3JvdXRlAAAACQAAAAAAAAAIcm91dGVfaWQAAAPuAAAAIAAAAAAAAAAEdXNlcgAAABMAAAAAAAAACWFuY2hvcl9pZAAAAAAAABAAAAAAAAAADHNvdXJjZV9hc3NldAAAABAAAAAAAAAADXNvdXJjZV9hbW91bnQAAAAAAAALAAAAAAAAABRkZXN0aW5hdGlvbl9jdXJyZW5jeQAAABAAAAAAAAAAEmRlc3RpbmF0aW9uX2Ftb3VudAAAAAAACwAAAAAAAAADZmVlAAAAAAsAAAAAAAAACnF1b3RlX2hhc2gAAAAAA+4AAAAgAAAAAQAAB9AAAAALUm91dGVSZWNvcmQA",
        "AAAABQAAAAAAAAAAAAAAElJvdXRlU3RhdHVzQ2hhbmdlZAAAAAAAAQAAABRyb3V0ZV9zdGF0dXNfY2hhbmdlZAAAAAQAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtSb3V0ZVN0YXR1cwAAAAAAAAAAAAAAABB0cmFuc2FjdGlvbl9oYXNoAAAD7gAAACAAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAEAAAAAAAAABWFkbWluAAAAAAAAEwAAAAA=",
        "AAAAAAAAAAAAAAAOZmluYWxpemVfcm91dGUAAAAAAAQAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAAAAAAABHVzZXIAAAATAAAAAAAAAAtzdGF0dXNfY29kZQAAAAAEAAAAAAAAABB0cmFuc2FjdGlvbl9oYXNoAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAAOZ2V0X3JvdXRlX3VzZXIAAAAAAAEAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAABAAAAEw==",
        "AAAAAAAAAAAAAAAPZ2V0X3VzZXJfcm91dGVzAAAAAAMAAAAAAAAABHVzZXIAAAATAAAAAAAAAAZjdXJzb3IAAAAAAAQAAAAAAAAABWxpbWl0AAAAAAAABAAAAAEAAAPqAAAH0AAAAAtSb3V0ZVJlY29yZAA=",
        "AAAAAAAAAAAAAAAUY29uZmlndXJlX3NldHRsZW1lbnQAAAABAAAAAAAAABNzZXR0bGVtZW50X2NvbnRyYWN0AAAAABMAAAAA",
        "AAAAAAAAAAAAAAAUZ2V0X3VzZXJfcm91dGVfY291bnQAAAABAAAAAAAAAAR1c2VyAAAAEwAAAAEAAAAE",
        "AAAABQAAAAAAAAAAAAAAHFNldHRsZW1lbnRDb250cmFjdENvbmZpZ3VyZWQAAAABAAAAHnNldHRsZW1lbnRfY29udHJhY3RfY29uZmlndXJlZAAAAAAAAQAAAAAAAAATc2V0dGxlbWVudF9jb250cmFjdAAAAAATAAAAAQAAAAI=" ]),
      options
    )
  }
  public readonly fromJSON = {
    get_route: this.txFromJSON<RouteRecord>,
        create_route: this.txFromJSON<RouteRecord>,
        finalize_route: this.txFromJSON<null>,
        get_route_user: this.txFromJSON<string>,
        get_user_routes: this.txFromJSON<Array<RouteRecord>>,
        configure_settlement: this.txFromJSON<null>,
        get_user_route_count: this.txFromJSON<u32>
  }
}
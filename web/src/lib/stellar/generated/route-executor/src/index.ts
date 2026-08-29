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





export interface Client {
  /**
   * Construct and simulate a configuration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  configuration: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [string, string, string, string, i128]>>

  /**
   * Construct and simulate a execute_route transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  execute_route: ({route_id, receipt_id, user, anchor_id, source_asset, source_amount, destination_currency, destination_amount, fee, quote_hash}: {route_id: Buffer, receipt_id: Buffer, user: string, anchor_id: string, source_asset: string, source_amount: i128, destination_currency: string, destination_amount: i128, fee: i128, quote_hash: Buffer}, options?: MethodOptions) => Promise<AssembledTransaction<null>>

  /**
   * Construct and simulate a proof_configuration transaction. Returns an `AssembledTransaction` object which will have a `result` field containing the result of the simulation. If this transaction changes contract state, you will need to call `signAndSend()` on the returned object.
   */
  proof_configuration: (options?: MethodOptions) => Promise<AssembledTransaction<readonly [string, string, i128]>>

}
export class Client extends ContractClient {
  static async deploy<T = Client>(
        /** Constructor/Initialization Args for the contract's `__constructor` method */
        {registry, settlement, proof_asset, proof_destination}: {registry: string, settlement: string, proof_asset: string, proof_destination: string},
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
    return ContractClient.deploy({registry, settlement, proof_asset, proof_destination}, options)
  }
  constructor(public readonly options: ContractClientOptions) {
    super(
      new ContractSpec([ "AAAABQAAAAAAAAAAAAAADVJvdXRlRXhlY3V0ZWQAAAAAAAABAAAADnJvdXRlX2V4ZWN1dGVkAAAAAAAFAAAAAAAAAAhyb3V0ZV9pZAAAA+4AAAAgAAAAAQAAAAAAAAAEdXNlcgAAABMAAAABAAAAAAAAAApyZWNlaXB0X2lkAAAAAAPuAAAAIAAAAAAAAAAAAAAAEXByb29mX2Rlc3RpbmF0aW9uAAAAAAAAEwAAAAAAAAAAAAAADHByb29mX2Ftb3VudAAAAAsAAAAAAAAAAg==",
        "AAAAAAAAAAAAAAANX19jb25zdHJ1Y3RvcgAAAAAAAAQAAAAAAAAACHJlZ2lzdHJ5AAAAEwAAAAAAAAAKc2V0dGxlbWVudAAAAAAAEwAAAAAAAAALcHJvb2ZfYXNzZXQAAAAAEwAAAAAAAAARcHJvb2ZfZGVzdGluYXRpb24AAAAAAAATAAAAAA==",
        "AAAAAAAAAAAAAAANY29uZmlndXJhdGlvbgAAAAAAAAAAAAABAAAD7QAAAAUAAAATAAAAEwAAABMAAAATAAAACw==",
        "AAAAAAAAAAAAAAANZXhlY3V0ZV9yb3V0ZQAAAAAAAAoAAAAAAAAACHJvdXRlX2lkAAAD7gAAACAAAAAAAAAACnJlY2VpcHRfaWQAAAAAA+4AAAAgAAAAAAAAAAR1c2VyAAAAEwAAAAAAAAAJYW5jaG9yX2lkAAAAAAAAEAAAAAAAAAAMc291cmNlX2Fzc2V0AAAAEAAAAAAAAAANc291cmNlX2Ftb3VudAAAAAAAAAsAAAAAAAAAFGRlc3RpbmF0aW9uX2N1cnJlbmN5AAAAEAAAAAAAAAASZGVzdGluYXRpb25fYW1vdW50AAAAAAALAAAAAAAAAANmZWUAAAAACwAAAAAAAAAKcXVvdGVfaGFzaAAAAAAD7gAAACAAAAAA",
        "AAAAAAAAAAAAAAATcHJvb2ZfY29uZmlndXJhdGlvbgAAAAAAAAAAAQAAA+0AAAADAAAAEwAAABMAAAAL" ]),
      options
    )
  }
  public readonly fromJSON = {
    configuration: this.txFromJSON<readonly [string, string, string, string, i128]>,
        execute_route: this.txFromJSON<null>,
        proof_configuration: this.txFromJSON<readonly [string, string, i128]>
  }
}
"use client";

import { AnchorProvider, Program, type Idl as AnchorIdl } from "@coral-xyz/anchor";
import { useAnchorWallet, useConnection } from "@solana/wallet-adapter-react";
import { PublicKey, type Transaction, type VersionedTransaction } from "@solana/web3.js";
import { useMemo } from "react";

import { IDL } from "./idl";

/**
 * Anchor Program for Tumar. Returns a Program even without a connected wallet,
 * using a read-only dummy signer. Callers that need to sign (createVault,
 * joinVault, updateAllocation, recordContribution) must still guard on
 * `publicKey` from `useWallet()`. Callers that only read (useVault,
 * contribution queries) work regardless.
 *
 * Before this, /join and other pre-connect pages rendered blank because
 * `program` was null until Phantom attached - which is backwards: the user
 * needs to *see* what they're joining before deciding to connect.
 */
const READ_ONLY_PUBKEY = new PublicKey("11111111111111111111111111111111");
const readOnlyWallet = {
  publicKey: READ_ONLY_PUBKEY,
  signTransaction: async <T extends Transaction | VersionedTransaction>(t: T) => t,
  signAllTransactions: async <T extends Transaction | VersionedTransaction>(ts: T[]) => ts,
};

export function useTumarProgram() {
  const { connection } = useConnection();
  const wallet = useAnchorWallet();

  return useMemo(() => {
    const provider = new AnchorProvider(
      connection,
      (wallet ?? readOnlyWallet) as unknown as AnchorProvider["wallet"],
      { commitment: "confirmed", preflightCommitment: "confirmed" },
    );
    return new Program(IDL as unknown as AnchorIdl, provider);
  }, [connection, wallet]);
}

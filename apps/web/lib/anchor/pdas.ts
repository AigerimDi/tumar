import { PublicKey } from "@solana/web3.js";

export const PROGRAM_ID = new PublicKey(
  process.env.NEXT_PUBLIC_PROGRAM_ID ?? "HfCmnXggSF2tVQkCrEdPNjUTBYvvC8tgbebXES2sp24Y",
);

const te = new TextEncoder();

export function vaultPda(creator: PublicKey, name: string) {
  return PublicKey.findProgramAddressSync(
    [te.encode("vault"), creator.toBuffer(), te.encode(name)],
    PROGRAM_ID,
  );
}

export function memberPda(vault: PublicKey, owner: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [te.encode("member"), vault.toBuffer(), owner.toBuffer()],
    PROGRAM_ID,
  );
}

export function contributionPda(vault: PublicKey, owner: PublicKey, unixSeconds: bigint) {
  const ts = Buffer.alloc(8);
  ts.writeBigInt64LE(unixSeconds);
  return PublicKey.findProgramAddressSync(
    [te.encode("contrib"), vault.toBuffer(), owner.toBuffer(), ts],
    PROGRAM_ID,
  );
}

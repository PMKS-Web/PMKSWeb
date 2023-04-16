import { BaseNConverter } from "./base64-converter";

/**
 * The FlagPacker class provides static utility methods for encoding and decoding
 * an array of boolean flags into a single base64-encoded character. This allows
 * for efficient storage and transmission of multiple boolean values.
 *
 * The class leverages the base64Converter class for converting integers to and
 * from base64-encoded strings.
 *
 * Example usage:
 *
 * const flagsToPack = [true, false, true, false, true];
 * const packedFlags = FlagPacker.pack(flagsToPack);
 * console.log("Packed flags:", packedFlags); // Output: "B"
 *
 * const numFlags = 5;
 * const unpackedFlags = FlagPacker.unpack(packedFlags, numFlags);
 * console.log("Unpacked flags:", unpackedFlags); // Output: [true, false, true, false, true]
 */
export class FlagPacker {

  /**
   * Calculates the length of the encoded string for the given number of flags.
   * Takes into account the number of possible encoded characters (BaseNConverter.N).
   * For base64 encoding, each character can represent 6 bits of information.
   *
  **/
  static getEncodedLength(numFlags: number): number {
    return Math.ceil(numFlags / Math.log2(BaseNConverter.N));
  }

  // Packs a given array of boolean flags into a base64 encoded string
  static pack(flags: boolean[]): string {
    let packed = 0;
    for (let i = 0; i < flags.length; i++) {
      if (flags[i]) {
        packed |= 1 << i;
      }
    }

    let paddedLength = FlagPacker.getEncodedLength(flags.length);
    return BaseNConverter.toUrlSafeBaseN(packed, paddedLength);
  }

  // Unpacks the specified number of flags from the base64 encoded string
  // and returns an array of booleans
  static unpack(packedFlags: string, numFlags: number): boolean[] {
    const packed = BaseNConverter.fromUrlSafeBaseN(packedFlags, true);
    const flags: boolean[] = [];
    for (let i = 0; i < numFlags; i++) {
      flags.push((packed & (1 << i)) !== 0);
    }
    return flags;
  }
}
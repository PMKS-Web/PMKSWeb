import { Base62Converter } from "./base62-converter";

/**
 * The FlagPacker class provides static utility methods for encoding and decoding
 * an array of boolean flags into a single base62-encoded character. This allows
 * for efficient storage and transmission of multiple boolean values.
 *
 * The class leverages the Base62Converter class for converting integers to and
 * from base62-encoded strings.
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

    // Packs a given array of boolean flags into a base62 encoded string
    static pack(flags: boolean[]): string {
      let packed = 0;
      for (let i = 0; i < flags.length; i++) {
        if (flags[i]) {
          packed |= 1 << i;
        }
      }
      return Base62Converter.toUrlSafeBase62(packed);
    }
  
    // Unpacks the specified number of flags from the base62 encoded string
    // and returns an array of booleans
    static unpack(packedFlags: string, numFlags: number): boolean[] {
      const packed = Base62Converter.fromUrlSafeBase62(packedFlags);
      const flags: boolean[] = [];
      for (let i = 0; i < numFlags; i++) {
        flags.push((packed & (1 << i)) !== 0);
      }
      return flags;
    }
  }
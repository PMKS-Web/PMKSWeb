/*
This class verifies a string through a checksum, that the length
of the encoded string mod len(CHECKSUM_CHARS) is equal to the
last character of the encoded string. This allows for efficient
verification of the integrity of a string.
*/

export class Checksum {

    // the only characters allowed in the checksum
    static readonly CHECKSUM_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

    generateChecksum(length: number): string {
        let i = length % Checksum.CHECKSUM_CHARS.length;
        return Checksum.CHECKSUM_CHARS[i];
    }

    verifyChecksum(length: number, checksum: string): boolean {
        let i = length % Checksum.CHECKSUM_CHARS.length;
        return Checksum.CHECKSUM_CHARS[i] === checksum;
    }
}
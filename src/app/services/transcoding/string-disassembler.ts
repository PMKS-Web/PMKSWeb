import { BaseNConverter } from "./base64-converter";
import { FlagPacker } from "./flag-packer";

/**
 * StringDisassembler class provides a convenient way to extract values
 * from a given string by sequentially retrieving characters and tokens
 * (substrings separated by a delimiter). It can also decode integers and
 * decimal numbers previously encoded using base62.
 *
 * The class maintains the remaining part of the input string as it
 * processes the tokens and characters, making it easy to extract
 * multiple values in sequence.
 */
export class StringDisassembler {
    private remaining: string;

    constructor(fullString: string) {
        this.remaining = fullString;
    }

    // Returns the next character without stripping
    pollNextCharacter(): string {
        if (this.isEmpty()) {
            return "";
        }

        return this.remaining.charAt(0);
    }

    // strips and returns the next character from the start of the string
    nextCharacter(): string {

        if (this.isEmpty()) {
            return "";
        }

        let result = this.remaining.charAt(0);
        this.remaining = this.remaining.substring(1);
        return result;
    }

    nextSubstring(length: number): string {
        if (this.isEmpty()) {
            return "";
        }

        if (length > this.remaining.length) {
            length = this.remaining.length;
        }

        let result = this.remaining.substring(0, length);
        this.remaining = this.remaining.substring(length);
        return result;
    }

    // strips the next character and returns the decoded form given as a list of boolean flags
    nextFlags(numFlags: number): boolean[] {
        if (this.isEmpty()) {
            return new Array(numFlags).fill(false);
        }
        
        const length = FlagPacker.getEncodedLength(numFlags);
        return FlagPacker.unpack(this.nextSubstring(length), numFlags);
    }

    // strips and returns the next substring up to the delimeter.
    // Strips the delimiter but does not return it.
    nextToken(delimiter: string = ","): string {
        let index = this.remaining.indexOf(delimiter);

        // not found, so return whole string
        if (index == -1) {
            let result = this.remaining;
            this.remaining = "";
            return result;
        }

        let result = this.remaining.substring(0, index);
        this.remaining = this.remaining.substring(index+1);
        return result;
    }
    // converts the substring (from the start of the remaining string to the delimeter)
    // to an integer, which is currently stored with base62 encoding
    nextInteger(delimiter: string = ","): number {
        let token = this.nextToken(delimiter);
        return BaseNConverter.fromUrlSafeBaseN(token);
    }

    // converts the substring (from the start of the remaining string to the delimeter)
    // to an integer, which is currently stored with base62 encoding
    // However, the number was multiplied by 1000 and rounded to store 3-digit precision
    // undo this by dividing by 1000
    nextDecimalNumber(delimiter: string = ","): number {
        return this.nextInteger(delimiter) / 1000;
    }

    isEmpty(): boolean {
        return this.remaining.length == 0;
    }
}
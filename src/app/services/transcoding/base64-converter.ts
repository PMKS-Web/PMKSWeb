/**
Base62Converter is a utility class that provides encoding and decoding
operations between integers and Base64 strings. Base64 is a numeral system
that uses 64 distinct characters (26 uppercase letters, 26 lowercase letters,
10 digits, _ and -) to represent numbers. This class is particularly useful for
generating compact and URL-safe representations of numbers.

Encoding:
Converts an integer into a Base64 string. If the input number is negative,
a '-' sign is added to the beginning of the encoded string.

Decoding:
Converts a BaseN string back into an integer. If the input string starts
with a '-', the decoded number will be negative.
*/
export class BaseNConverter {

    // the list of uri-allowed characters, excluding , . - _ ~
    static readonly baseNChars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";
    static readonly N = this.baseNChars.length;

    // convert number to base64. If negative, add 0 to the beginning.
    static toUrlSafeBaseN(integer: number, padToLength: number | null = null): string {
        // assert integer is a whole number
        integer = Math.floor(integer);

        let positive = (integer >= 0); // Store sign to insert - to beginning if negative
        integer = Math.abs(integer); // We only deal with positive numbers now

        let baseNString = "";
        do {
            baseNString = BaseNConverter.baseNChars.charAt(integer % BaseNConverter.N) + baseNString;
            integer = Math.floor(integer / BaseNConverter.N);
        } while (integer > 0);

        if (!positive) {
            baseNString = "0" + baseNString;
        }

        if (padToLength !== null && baseNString.length < padToLength) {
            baseNString = "0".repeat(padToLength - baseNString.length) + baseNString;
        }
    
        return baseNString;
    }

    // decode base64 string back to number. If string starts with 0, the number is nonpositive.
    static fromUrlSafeBaseN(baseNString: string, forcePositive: boolean = false): number {
        let positive = true; // Assume positive number by default
        let index = 0;

        if (!forcePositive && baseNString[0] === '0') {
            positive = false; // Number is negative
            index = 1; // Start decoding from index 1, skipping the negative sign
        }

        let integer = 0;
        for (let i = index; i < baseNString.length; i++) {
            integer *= BaseNConverter.N;
            integer += BaseNConverter.baseNChars.indexOf(baseNString[i]);
        }

        if (!positive && integer !== 0) {
            integer = -integer;
        }

        return integer;
    }
}
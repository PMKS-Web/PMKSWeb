/**
Base62Converter is a utility class that provides encoding and decoding
operations between integers and Base62 strings. Base62 is a numeral system
that uses 62 distinct characters (26 uppercase letters, 26 lowercase letters,
and 10 digits) to represent numbers. This class is particularly useful for
generating compact and URL-safe representations of numbers.

Encoding:
Converts an integer into a Base62 string. If the input number is negative,
a '-' sign is added to the beginning of the encoded string.

Decoding:
Converts a Base62 string back into an integer. If the input string starts
with a '-', the decoded number will be negative.
*/
export class Base64Converter {

    // the list of uri-allowed characters, excluding , . - _ ~
    static readonly base64Chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_-";

    // convert number to base62. If negative, add 0 to the beginning.
    static toUrlSafeBase64(integer: number): string {
        // assert integer is a whole number
        integer = Math.floor(integer);

        let positive = (integer >= 0); // Store sign to insert - to beginning if negative
        integer = Math.abs(integer); // We only deal with positive numbers now

        let base64String = "";
        do {
            base64String = Base64Converter.base64Chars.charAt(integer % 64) + base64String;
            integer = Math.floor(integer / 64);
        } while (integer > 0);

        if (!positive) {
            base64String = "0" + base64String;
        }
    
        return base64String;
    }

    // decode base62 string back to number. If string starts with 0, the number is nonpositive.
    static fromUrlSafeBase64(base64String: string): number {
        let positive = true; // Assume positive number by default
        let index = 0;

        if (base64String[0] === '0') {
            positive = false; // Number is negative
            index = 1; // Start decoding from index 1, skipping the negative sign
        }

        let integer = 0;
        for (let i = index; i < base64String.length; i++) {
            integer *= 62;
            integer += Base64Converter.base64Chars.indexOf(base64String[i]);
        }

        if (!positive) {
            integer = -integer;
        }

        return integer;
    }
}
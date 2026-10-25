/**
 * The flag emoji for an ISO 3166-1 alpha-2 country code (no flag images needed).
 *
 * @example
 * readCountryFlag("CH"); // "🇨🇭"
 */
export function readCountryFlag(countryCode: string | null): string {
  if (!countryCode || !/^[A-Za-z]{2}$/.test(countryCode)) return "";
  return String.fromCodePoint(...[...countryCode.toUpperCase()].map((letter) => 0x1_f1_e6 + letter.charCodeAt(0) - 65));
}

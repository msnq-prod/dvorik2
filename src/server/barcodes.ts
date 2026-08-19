import { DomainError } from "./domain-core";

export type Barcode = {
  type: "code128" | "ean13";
  value: string;
  pattern: string;
};

const code128Patterns = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112"
];

const eanL = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
const eanG = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
const eanR = ["1110010", "1100110", "1101100", "1000010", "1011100", "1001110", "1010000", "1000100", "1001000", "1110100"];
const eanParity = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];

function widthsToBits(widths: string) {
  let bar = true;
  let bits = "";
  for (const char of widths) {
    bits += (bar ? "1" : "0").repeat(Number(char));
    bar = !bar;
  }
  return bits;
}

export function isValidEan13(value: string) {
  if (!/^\d{13}$/.test(value)) return false;
  const digits = [...value].map(Number);
  const sum = digits.slice(0, 12).reduce((total, digit, index) => total + digit * (index % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10 === digits[12];
}

export function encodeEan13(value: string) {
  if (!isValidEan13(value)) throw new DomainError("BAD_BARCODE", "EAN-13 должен быть корректным 13-значным кодом");
  const digits = [...value].map(Number);
  const parity = eanParity[digits[0]];
  const left = digits.slice(1, 7).map((digit, index) => (parity[index] === "L" ? eanL[digit] : eanG[digit])).join("");
  const right = digits.slice(7).map((digit) => eanR[digit]).join("");
  return `101${left}01010${right}101`;
}

export function canEncodeCode128(value: string) {
  return value.length > 0 && [...value].every((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) <= 126);
}

export function encodeCode128B(value: string) {
  if (!canEncodeCode128(value)) throw new DomainError("BAD_BARCODE", "Code 128 поддерживает только печатаемые ASCII-символы");
  const codes = [...value].map((char) => char.charCodeAt(0) - 32);
  const checksum = codes.reduce((total, code, index) => total + code * (index + 1), 104) % 103;
  return [104, ...codes, checksum, 106].map((code) => widthsToBits(code128Patterns[code])).join("");
}

export function buildBarcode(value: string, fallback: string): Barcode {
  const normalized = value.trim();
  if (isValidEan13(normalized)) return { type: "ean13", value: normalized, pattern: encodeEan13(normalized) };
  if (canEncodeCode128(normalized)) return { type: "code128", value: normalized, pattern: encodeCode128B(normalized) };
  if (canEncodeCode128(fallback)) return { type: "code128", value: fallback, pattern: encodeCode128B(fallback) };
  throw new DomainError("BAD_BARCODE", "Не удалось сформировать штрихкод");
}

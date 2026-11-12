import React from "react";

/**
 * QR Code Generator Mandiri (Zero Dependency)
 * Berdasarkan standar ISO/IEC 18004
 * Menghasilkan elemen SVG vektor murni yang tajam dan ringan
 */

export interface EccLevel {
  ordinal: number;
  formatBits: number;
}

export const Ecc: Record<"LOW" | "MEDIUM" | "QUARTILE" | "HIGH", EccLevel> = {
  LOW: { ordinal: 0, formatBits: 1 },
  MEDIUM: { ordinal: 1, formatBits: 0 },
  QUARTILE: { ordinal: 2, formatBits: 3 },
  HIGH: { ordinal: 3, formatBits: 2 },
};

// Jumlah codeword error correction per blok [version 1..10][ecc]
const ECC_CODEWORDS_PER_BLOCK: number[][] = [
  [-1, -1, -1, -1],
  [7, 10, 13, 17], // v1
  [10, 16, 22, 28], // v2
  [15, 26, 36, 44], // v3
  [20, 18, 26, 16], // v4
  [26, 24, 18, 22], // v5
  [18, 16, 24, 28], // v6
  [20, 18, 18, 26], // v7
  [24, 22, 22, 26], // v8
  [30, 22, 20, 24], // v9
  [18, 26, 24, 28], // v10
];

// Jumlah blok error correction [version 1..10][ecc]
const NUM_ERROR_CORRECTION_BLOCKS: number[][] = [
  [-1, -1, -1, -1],
  [1, 1, 1, 1],
  [1, 1, 1, 1],
  [1, 1, 2, 2],
  [1, 2, 2, 4],
  [1, 2, 4, 4],
  [2, 4, 4, 4],
  [2, 4, 6, 5],
  [2, 4, 6, 6],
  [2, 5, 8, 8],
  [4, 5, 8, 8],
];

// Koordinat dasar pola penyelarasan (alignment pattern) per versi
const ALIGNMENT_PATTERN_BASE: number[][] = [
  [],
  [], // v1
  [6, 18], // v2
  [6, 22], // v3
  [6, 26], // v4
  [6, 30], // v5
  [6, 34], // v6
  [6, 22, 38], // v7
  [6, 24, 42], // v8
  [6, 26, 46], // v9
  [6, 28, 50], // v10
];

// Tabel logaritma & eksponensial GF(256)
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);
let val = 1;
for (let i = 0; i < 255; i++) {
  EXP_TABLE[i] = val;
  LOG_TABLE[val] = i;
  val = (val << 1) ^ (val & 128 ? 0x11d : 0);
}
EXP_TABLE[255] = EXP_TABLE[0];

function gMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function reedSolomonComputeDivisor(degree: number): Uint8Array {
  const result = new Uint8Array(degree);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = gMul(result[j], root);
      if (j + 1 < degree) {
        result[j] ^= result[j + 1];
      }
    }
    root = (root << 1) ^ (root & 128 ? 0x11d : 0);
  }
  return result;
}

function reedSolomonComputeRemainder(data: Uint8Array, divisor: Uint8Array): Uint8Array {
  const result = new Uint8Array(divisor.length);
  for (let i = 0; i < data.length; i++) {
    const factor = data[i] ^ result[0];
    result.copyWithin(0, 1);
    result[result.length - 1] = 0;
    for (let j = 0; j < divisor.length; j++) {
      result[j] ^= gMul(divisor[j], factor);
    }
  }
  return result;
}

function getNumRawDataModules(version: number): number {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const numAlign = Math.floor(version / 7) + 2;
    result -= (25 * numAlign - 10) * numAlign - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

function getNumDataCodewords(version: number, ecc: EccLevel): number {
  return (
    Math.floor(getNumRawDataModules(version) / 8) -
    ECC_CODEWORDS_PER_BLOCK[version][ecc.ordinal] *
      NUM_ERROR_CORRECTION_BLOCKS[version][ecc.ordinal]
  );
}

function encodeTextToBits(text: string, version: number): { bitBuffer: number[]; byteLen: number } {
  const bytes = new TextEncoder().encode(text);
  const bitBuffer: number[] = [];

  function appendBits(num: number, len: number) {
    for (let i = len - 1; i >= 0; i--) {
      bitBuffer.push((num >>> i) & 1);
    }
  }

  // Indikator mode: 0100 (Mode byte 8-bit)
  appendBits(0b0100, 4);

  // Indikator jumlah karakter (8 bit untuk v1-9, 16 bit untuk v10+)
  const countBits = version <= 9 ? 8 : 16;
  appendBits(bytes.length, countBits);

  // Data byte teks/URL
  for (let i = 0; i < bytes.length; i++) {
    appendBits(bytes[i], 8);
  }

  return { bitBuffer, byteLen: bytes.length };
}

function getMaskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0: return (x + y) % 2 === 0;
    case 1: return y % 2 === 0;
    case 2: return x % 3 === 0;
    case 3: return (x + y) % 3 === 0;
    case 4: return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0;
    case 5: return ((x * y) % 2) + ((x * y) % 3) === 0;
    case 6: return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0;
    case 7: return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0;
    default: return false;
  }
}

function calculatePenalty(modules: boolean[][], size: number): number {
  let penalty = 0;

  // N1: Modul berurutan dengan warna sama
  for (let y = 0; y < size; y++) {
    let runColor = false;
    let runLen = 0;
    for (let x = 0; x < size; x++) {
      if (x === 0 || modules[y][x] !== runColor) {
        runColor = modules[y][x];
        runLen = 1;
      } else {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      }
    }
  }

  for (let x = 0; x < size; x++) {
    let runColor = false;
    let runLen = 0;
    for (let y = 0; y < size; y++) {
      if (y === 0 || modules[y][x] !== runColor) {
        runColor = modules[y][x];
        runLen = 1;
      } else {
        runLen++;
        if (runLen === 5) penalty += 3;
        else if (runLen > 5) penalty += 1;
      }
    }
  }

  // N2: Blok 2x2 modul sewarna
  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const color = modules[y][x];
      if (
        color === modules[y][x + 1] &&
        color === modules[y + 1][x] &&
        color === modules[y + 1][x + 1]
      ) {
        penalty += 3;
      }
    }
  }

  // N3: Pola 1:0:1:1:1:0:1 dengan 4 ruang kosong
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size - 10; x++) {
      if (
        modules[y][x] &&
        !modules[y][x + 1] &&
        modules[y][x + 2] &&
        modules[y][x + 3] &&
        modules[y][x + 4] &&
        !modules[y][x + 5] &&
        modules[y][x + 6]
      ) {
        if (
          (!modules[y][x + 7] && !modules[y][x + 8] && !modules[y][x + 9] && !modules[y][x + 10]) ||
          (x >= 4 && !modules[y][x - 1] && !modules[y][x - 2] && !modules[y][x - 3] && !modules[y][x - 4])
        ) {
          penalty += 40;
        }
      }
    }
  }

  for (let x = 0; x < size; x++) {
    for (let y = 0; y < size - 10; y++) {
      if (
        modules[y][x] &&
        !modules[y + 1][x] &&
        modules[y + 2][x] &&
        modules[y + 3][x] &&
        modules[y + 4][x] &&
        !modules[y + 5][x] &&
        modules[y + 6][x]
      ) {
        if (
          (!modules[y + 7][x] && !modules[y + 8][x] && !modules[y + 9][x] && !modules[y + 10][x]) ||
          (y >= 4 && !modules[y - 1][x] && !modules[y - 2][x] && !modules[y - 3][x] && !modules[y - 4][x])
        ) {
          penalty += 40;
        }
      }
    }
  }

  // N4: Keseimbangan modul gelap dan terang
  let darkCount = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) darkCount++;
    }
  }
  const total = size * size;
  const percent = (darkCount * 100) / total;
  const prev5 = Math.abs(Math.floor(percent / 5) * 5 - 50);
  const next5 = Math.abs(Math.ceil(percent / 5) * 5 - 50);
  penalty += (Math.min(prev5, next5) / 5) * 10;

  return penalty;
}

export function createQrMatrix(
  text: string,
  minVersion = 1,
  maxVersion = 10,
  ecc = Ecc.MEDIUM
): { size: number; modules: boolean[][]; mask: number; penalty: number } {
  let version = minVersion;
  let bitsObj: { bitBuffer: number[]; byteLen: number } | null = null;

  for (; version <= maxVersion; version++) {
    const capacity = getNumDataCodewords(version, ecc);
    const textBytes = new TextEncoder().encode(text);
    const headerBits = 4 + (version <= 9 ? 8 : 16);
    const totalBits = headerBits + textBytes.length * 8;
    if (totalBits <= capacity * 8) {
      bitsObj = encodeTextToBits(text, version);
      break;
    }
  }

  if (!bitsObj || version > maxVersion) {
    throw new Error(`Teks terlalu panjang untuk QR Code versi <= ${maxVersion}`);
  }

  const bitBuffer = bitsObj.bitBuffer;
  const dataCapacityCodewords = getNumDataCodewords(version, ecc);

  const terminatorBits = Math.min(4, dataCapacityCodewords * 8 - bitBuffer.length);
  for (let i = 0; i < terminatorBits; i++) bitBuffer.push(0);

  while (bitBuffer.length % 8 !== 0) bitBuffer.push(0);

  const padBytes = [0xec, 0x11];
  let padIdx = 0;
  while (bitBuffer.length < dataCapacityCodewords * 8) {
    const b = padBytes[padIdx % 2];
    for (let i = 7; i >= 0; i--) {
      bitBuffer.push((b >>> i) & 1);
    }
    padIdx++;
  }

  const dataCodewords = new Uint8Array(dataCapacityCodewords);
  for (let i = 0; i < dataCapacityCodewords; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) {
      b = (b << 1) | bitBuffer[i * 8 + j];
    }
    dataCodewords[i] = b;
  }

  const numBlocks = NUM_ERROR_CORRECTION_BLOCKS[version][ecc.ordinal];
  const blockEccLen = ECC_CODEWORDS_PER_BLOCK[version][ecc.ordinal];
  const rawDataModules = Math.floor(getNumRawDataModules(version) / 8);
  const numShortBlocks = numBlocks - (rawDataModules % numBlocks);
  const shortBlockDataLen = Math.floor(rawDataModules / numBlocks) - blockEccLen;

  const rsDivisor = reedSolomonComputeDivisor(blockEccLen);
  const dataBlocks: Uint8Array[] = [];
  const eccBlocks: Uint8Array[] = [];

  let offset = 0;
  for (let i = 0; i < numBlocks; i++) {
    const dataLen = shortBlockDataLen + (i < numShortBlocks ? 0 : 1);
    const dataBlock = dataCodewords.slice(offset, offset + dataLen);
    offset += dataLen;
    dataBlocks.push(dataBlock);
    eccBlocks.push(reedSolomonComputeRemainder(dataBlock, rsDivisor));
  }

  const finalCodewords: number[] = [];
  for (let i = 0; i <= shortBlockDataLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      if (i < dataBlocks[j].length) {
        finalCodewords.push(dataBlocks[j][i]);
      }
    }
  }
  for (let i = 0; i < blockEccLen; i++) {
    for (let j = 0; j < numBlocks; j++) {
      finalCodewords.push(eccBlocks[j][i]);
    }
  }

  const size = version * 4 + 17;
  const baseModules = Array.from({ length: size }, () => new Array(size).fill(false));
  const isFunction = Array.from({ length: size }, () => new Array(size).fill(false));

  function setFunctionModule(x: number, y: number, isDark: boolean) {
    baseModules[y][x] = isDark;
    isFunction[y][x] = true;
  }

  // 1. Finder patterns
  function drawFinderPattern(x: number, y: number) {
    for (let dy = -1; dy <= 7; dy++) {
      for (let dx = -1; dx <= 7; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
          const dist = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
          setFunctionModule(nx, ny, dist !== 2 && dist !== 4);
        }
      }
    }
  }
  drawFinderPattern(0, 0);
  drawFinderPattern(size - 7, 0);
  drawFinderPattern(0, size - 7);

  // 2. Alignment patterns
  const alignPos = ALIGNMENT_PATTERN_BASE[version];
  for (let i = 0; i < alignPos.length; i++) {
    for (let j = 0; j < alignPos.length; j++) {
      const ax = alignPos[i];
      const ay = alignPos[j];
      if (
        (i === 0 && j === 0) ||
        (i === 0 && j === alignPos.length - 1) ||
        (i === alignPos.length - 1 && j === 0)
      ) {
        continue;
      }
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          setFunctionModule(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
        }
      }
    }
  }

  // 3. Timing patterns
  for (let i = 0; i < size; i++) {
    setFunctionModule(6, i, i % 2 === 0);
    setFunctionModule(i, 6, i % 2 === 0);
  }

  // 4. Dark module & format bits placeholder
  setFunctionModule(8, 4 * version + 9, true);
  for (let i = 0; i < 9; i++) {
    setFunctionModule(8, i, false);
    setFunctionModule(i, 8, false);
  }
  for (let i = 0; i < 8; i++) {
    setFunctionModule(8, size - 1 - i, false);
    setFunctionModule(size - 1 - i, 8, false);
  }

  // 5. Version info (v >= 7)
  if (version >= 7) {
    let rem = version;
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
    }
    const versionBits = (version << 12) | rem;
    for (let i = 0; i < 18; i++) {
      const bit = ((versionBits >>> i) & 1) === 1;
      const a = size - 11 + (i % 3);
      const b = Math.floor(i / 3);
      setFunctionModule(a, b, bit);
      setFunctionModule(b, a, bit);
    }
  }

  // 6. Data bits placement
  let bitIdx = 0;
  const totalBits = finalCodewords.length * 8;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? size - 1 - vert : vert;
        if (!isFunction[y][x]) {
          let dark = false;
          if (bitIdx < totalBits) {
            const byteVal = finalCodewords[Math.floor(bitIdx / 8)];
            dark = ((byteVal >>> (7 - (bitIdx % 8))) & 1) === 1;
            bitIdx++;
          }
          baseModules[y][x] = dark;
        }
      }
    }
  }

  // 7. Evaluasi 8 pola mask & pilih penalti terendah
  let bestMask = 0;
  let bestPenalty = Infinity;
  let bestModules = baseModules;

  for (let mask = 0; mask < 8; mask++) {
    const testModules = baseModules.map((row) => row.slice());

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        if (!isFunction[y][x]) {
          if (getMaskCondition(mask, x, y)) {
            testModules[y][x] = !testModules[y][x];
          }
        }
      }
    }

    let formatData = (ecc.formatBits << 3) | mask;
    let rem = formatData << 10;
    for (let i = 4; i >= 0; i--) {
      if ((rem >>> (i + 10)) & 1) {
        rem ^= 0x537 << i;
      }
    }
    const formatBits = ((formatData << 10) | rem) ^ 0x5412;

    for (let i = 0; i < 15; i++) {
      const bit = ((formatBits >>> i) & 1) === 1;
      if (i <= 5) testModules[i][8] = bit;
      else if (i === 6) testModules[7][8] = bit;
      else if (i === 7) testModules[8][8] = bit;
      else if (i === 8) testModules[8][7] = bit;
      else testModules[8][14 - i] = bit;

      if (i < 8) {
        testModules[8][size - 1 - i] = bit;
      } else {
        testModules[size - 15 + i][8] = bit;
      }
    }

    const penalty = calculatePenalty(testModules, size);
    if (penalty < bestPenalty) {
      bestPenalty = penalty;
      bestMask = mask;
      bestModules = testModules;
    }
  }

  return { size, modules: bestModules, mask: bestMask, penalty: bestPenalty };
}

export function qrMatrixToSvgPath(
  size: number,
  modules: boolean[][],
  margin = 2
): { fullSize: number; pathData: string } {
  const fullSize = size + margin * 2;
  const pathParts: string[] = [];

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) {
        pathParts.push(`M${x + margin},${y + margin}h1v1h-1z`);
      }
    }
  }

  return {
    fullSize,
    pathData: pathParts.join(""),
  };
}

export interface QrCodeProps {
  value: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function QrCode({ value, size = 80, className, style }: QrCodeProps) {
  if (!value) return null;

  try {
    const { size: matrixSize, modules } = createQrMatrix(value, 1, 10, Ecc.MEDIUM);
    const { fullSize, pathData } = qrMatrixToSvgPath(matrixSize, modules, 2);

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`0 0 ${fullSize} ${fullSize}`}
        width={size}
        height={size}
        className={className}
        style={{ display: "block", ...style }}
        aria-label="QR Code Verifikasi Keaslian"
      >
        <rect width="100%" height="100%" fill="#ffffff" />
        <path d={pathData} fill="#000000" />
      </svg>
    );
  } catch {
    return (
      <div
        style={{
          width: size,
          height: size,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#f1f5f9",
          border: "1px dashed #cbd5e1",
          fontSize: "0.65rem",
          color: "#64748b",
          textAlign: "center",
          padding: 4,
          ...style,
        }}
      >
        QR Error
      </div>
    );
  }
}

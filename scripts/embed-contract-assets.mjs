// Gera src/lib/contracts/assets.generated.ts a partir das imagens em
// src/lib/contracts/assets/ (logo e rodapé de cada empresa contratada).
//
// As imagens ficam embutidas como base64 de propósito: o app roda em modo
// `standalone`, que só copia para a imagem Docker os arquivos que o bundler
// consegue rastrear. Ler JPEG do disco em tempo de execução funcionaria no
// desenvolvimento e quebraria em produção sem aviso.
//
// Uso: node scripts/embed-contract-assets.mjs
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const assetsDir = path.join(root, "src/lib/contracts/assets");
const outFile = path.join(root, "src/lib/contracts/assets.generated.ts");

/** Lê largura e altura do marcador SOF de um JPEG. */
function jpegSize(buffer) {
  let offset = 2;
  while (offset < buffer.length) {
    if (buffer[offset] !== 0xff) throw new Error("JPEG inválido");
    const marker = buffer[offset + 1];
    const length = buffer.readUInt16BE(offset + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    }
    offset += 2 + length;
  }
  throw new Error("JPEG sem SOF");
}

const entries = readdirSync(assetsDir)
  .filter((name) => name.endsWith(".jpg"))
  .sort()
  .map((name) => {
    const buffer = readFileSync(path.join(assetsDir, name));
    const { width, height } = jpegSize(buffer);
    const key = name.replace(/\.jpg$/, "").toUpperCase().replace(/-/g, "_");
    return `  ${key}: {\n    width: ${width},\n    height: ${height},\n    base64:\n      "${buffer.toString("base64")}",\n  },`;
  });

writeFileSync(
  outFile,
  `// GERADO por scripts/embed-contract-assets.mjs — não editar à mão.
export const CONTRACT_IMAGES = {
${entries.join("\n")}
} as const;

export type ContractImageKey = keyof typeof CONTRACT_IMAGES;
`,
);

console.log(`${entries.length} imagens embutidas em ${path.relative(root, outFile)}`);

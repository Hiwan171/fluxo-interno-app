/**
 * Reconhecimento de documentos do Office pelo conteúdo.
 *
 * Os formatos modernos (docx, xlsx, pptx) são arquivos ZIP; os antigos (doc, xls,
 * ppt) são contêineres OLE2. Nenhum dos dois é inspecionado pelo que o cliente
 * declarou: a decisão vem da estrutura do arquivo.
 *
 * Duas regras de segurança valem aqui:
 *  - arquivo com macro (`vbaProject.bin` no ZIP, ou `_VBA_PROJECT` no OLE2) é
 *    recusado — o Office abre planilhas e documentos de colegas sem desconfiar, e
 *    macro é o vetor clássico de código malicioso;
 *  - o ZIP nunca é descompactado. Só o índice de nomes (diretório central) é
 *    lido, o que torna inócua uma "bomba de compressão".
 *
 * O servidor entrega estes tipos sempre como download (`Content-Disposition:
 * attachment`), com `nosniff` e CSP em sandbox; nunca são exibidos no navegador.
 */

export const OFFICE_TYPES = {
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  doc: "application/msword",
  xls: "application/vnd.ms-excel",
  ppt: "application/vnd.ms-powerpoint",
} as const;

const ZIP_SIGNATURE = [0x50, 0x4b, 0x03, 0x04];
const OLE2_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

const END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const CENTRAL_DIRECTORY_ENTRY = 0x02014b50;
const MAX_ZIP_ENTRIES = 20_000;

function startsWith(buffer: Buffer, signature: number[]): boolean {
  return (
    buffer.length >= signature.length &&
    signature.every((byte, index) => buffer[index] === byte)
  );
}

/** Nomes das entradas do ZIP, lidos do diretório central. Nulo se malformado. */
function listZipEntryNames(buffer: Buffer): string[] | null {
  const earliest = Math.max(0, buffer.length - 22 - 0xffff);

  for (let i = buffer.length - 22; i >= earliest; i -= 1) {
    if (buffer.readUInt32LE(i) !== END_OF_CENTRAL_DIRECTORY) continue;

    const total = buffer.readUInt16LE(i + 10);
    const size = buffer.readUInt32LE(i + 12);
    const offset = buffer.readUInt32LE(i + 16);

    // 0xffff/0xffffffff indicam ZIP64, que documentos do Office não usam.
    if (total === 0xffff || offset + size > buffer.length) return null;

    const names: string[] = [];
    let position = offset;

    for (let entry = 0; entry < total && entry < MAX_ZIP_ENTRIES; entry += 1) {
      if (
        position + 46 > buffer.length ||
        buffer.readUInt32LE(position) !== CENTRAL_DIRECTORY_ENTRY
      ) {
        return null;
      }

      const nameLength = buffer.readUInt16LE(position + 28);
      const extraLength = buffer.readUInt16LE(position + 30);
      const commentLength = buffer.readUInt16LE(position + 32);

      if (position + 46 + nameLength > buffer.length) return null;

      names.push(buffer.toString("utf8", position + 46, position + 46 + nameLength));
      position += 46 + nameLength + extraLength + commentLength;
    }

    return names;
  }

  return null;
}

function sniffOoxml(buffer: Buffer): string | null {
  const names = listZipEntryNames(buffer);
  if (!names) return null;

  if (names.some((name) => /(^|\/)vbaProject\.bin$/i.test(name))) return null;
  // Objetos embutidos (um executável dentro de um .docx, por exemplo) e ActiveX
  // são o segundo vetor clássico depois da macro.
  if (names.some((name) => /(^|\/)(embeddings|activeX)\//i.test(name))) return null;
  if (!names.includes("[Content_Types].xml")) return null;

  if (names.some((name) => name.startsWith("word/"))) return OFFICE_TYPES.docx;
  if (names.some((name) => name.startsWith("xl/"))) return OFFICE_TYPES.xlsx;
  if (names.some((name) => name.startsWith("ppt/"))) return OFFICE_TYPES.pptx;

  // ZIP comum: não é documento do Office.
  return null;
}

/** Os nomes dos fluxos do OLE2 ficam em UTF-16LE no diretório do arquivo. */
function hasStream(buffer: Buffer, name: string): boolean {
  return buffer.includes(Buffer.from(name, "utf16le"));
}

function sniffOle2(buffer: Buffer): string | null {
  if (hasStream(buffer, "_VBA_PROJECT")) return null;
  // Objeto embutido (pacote OLE com arquivo qualquer dentro).
  if (hasStream(buffer, "Ole10Native") || hasStream(buffer, "ObjectPool")) return null;

  if (hasStream(buffer, "Workbook")) return OFFICE_TYPES.xls;
  // Excel 5/95. O "B" maiúsculo distingue do "Workbook" (que tem "b" minúsculo).
  if (hasStream(buffer, "Book")) return OFFICE_TYPES.xls;
  if (hasStream(buffer, "WordDocument")) return OFFICE_TYPES.doc;
  if (hasStream(buffer, "PowerPoint Document")) return OFFICE_TYPES.ppt;

  // Outros contêineres OLE2 (Outlook .msg, instaladores .msi): fora da lista.
  return null;
}

/** Tipo do documento do Office, ou nulo se não for um (ou tiver macro). */
export function sniffOfficeType(buffer: Buffer): string | null {
  if (startsWith(buffer, ZIP_SIGNATURE)) return sniffOoxml(buffer);
  if (startsWith(buffer, OLE2_SIGNATURE)) return sniffOle2(buffer);
  return null;
}

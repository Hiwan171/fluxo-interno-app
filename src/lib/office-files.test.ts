import { describe, expect, it } from "vitest";

import { OFFICE_TYPES, sniffOfficeType } from "@/lib/office-files";

/** ZIP mínimo, só com o diretório de nomes (o conteúdo nunca é lido). */
function zip(names: string[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const name of names) {
    const nameBuffer = Buffer.from(name);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuffer.length, 26);
    const localEntry = Buffer.concat([local, nameBuffer]);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);

    locals.push(localEntry);
    centrals.push(Buffer.concat([central, nameBuffer]));
    offset += localEntry.length;
  }

  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);

  return Buffer.concat([...locals, directory, end]);
}

/** Contêiner OLE2 de mentira: assinatura + nomes de fluxo em UTF-16LE. */
function ole2(...streams: string[]): Buffer {
  return Buffer.concat([
    Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
    Buffer.alloc(512),
    ...streams.map((name) => Buffer.from(name, "utf16le")),
    Buffer.alloc(64),
  ]);
}

describe("sniffOfficeType — formatos modernos (ZIP)", () => {
  it("reconhece docx, xlsx e pptx pela estrutura", () => {
    expect(sniffOfficeType(zip(["[Content_Types].xml", "word/document.xml"]))).toBe(OFFICE_TYPES.docx);
    expect(sniffOfficeType(zip(["[Content_Types].xml", "xl/workbook.xml"]))).toBe(OFFICE_TYPES.xlsx);
    expect(sniffOfficeType(zip(["[Content_Types].xml", "ppt/presentation.xml"]))).toBe(OFFICE_TYPES.pptx);
  });

  it("recusa documento com macro", () => {
    expect(
      sniffOfficeType(zip(["[Content_Types].xml", "xl/workbook.xml", "xl/vbaProject.bin"])),
    ).toBeNull();
  });

  it("recusa documento com objeto embutido ou ActiveX", () => {
    expect(
      sniffOfficeType(zip(["[Content_Types].xml", "word/document.xml", "word/embeddings/oleObject1.bin"])),
    ).toBeNull();
    expect(
      sniffOfficeType(zip(["[Content_Types].xml", "xl/workbook.xml", "xl/activeX/activeX1.xml"])),
    ).toBeNull();
  });

  it("recusa ZIP comum e ZIP sem [Content_Types].xml", () => {
    expect(sniffOfficeType(zip(["fotos/1.jpg", "leia-me.txt"]))).toBeNull();
    expect(sniffOfficeType(zip(["word/document.xml"]))).toBeNull();
  });

  it("recusa ZIP truncado sem quebrar", () => {
    const valid = zip(["[Content_Types].xml", "word/document.xml"]);
    expect(sniffOfficeType(valid.subarray(0, valid.length - 10))).toBeNull();
    expect(sniffOfficeType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });
});

describe("sniffOfficeType — formatos antigos (OLE2)", () => {
  it("reconhece xls, doc e ppt pelo nome do fluxo", () => {
    expect(sniffOfficeType(ole2("Workbook"))).toBe(OFFICE_TYPES.xls);
    expect(sniffOfficeType(ole2("Book"))).toBe(OFFICE_TYPES.xls);
    expect(sniffOfficeType(ole2("WordDocument"))).toBe(OFFICE_TYPES.doc);
    expect(sniffOfficeType(ole2("PowerPoint Document"))).toBe(OFFICE_TYPES.ppt);
  });

  it("recusa planilha com macro VBA ou objeto embutido", () => {
    expect(sniffOfficeType(ole2("Workbook", "_VBA_PROJECT_CUR", "_VBA_PROJECT"))).toBeNull();
    expect(sniffOfficeType(ole2("WordDocument", "ObjectPool"))).toBeNull();
    expect(sniffOfficeType(ole2("Workbook", "Ole10Native"))).toBeNull();
  });

  it("recusa outros contêineres OLE2, como e-mail do Outlook", () => {
    expect(sniffOfficeType(ole2("__substg1.0_0037001F"))).toBeNull();
  });
});

describe("sniffOfficeType — o que não é Office", () => {
  it("devolve nulo para conteúdo qualquer, vazio ou curto", () => {
    expect(sniffOfficeType(Buffer.from("MZ executavel"))).toBeNull();
    expect(sniffOfficeType(Buffer.from("<html><script>"))).toBeNull();
    expect(sniffOfficeType(Buffer.alloc(0))).toBeNull();
  });
});

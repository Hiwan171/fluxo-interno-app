import { describe, expect, it } from "vitest";

import { canBeServedInline, sniffMimeType } from "@/lib/attachments";

/**
 * O tipo declarado pelo cliente (`file.type`) nunca decide nada — quem decide é
 * a assinatura do conteúdo. Estes testes fixam esse contrato, que é o que
 * fechou a execução de script a partir de um anexo.
 */

function bytes(...values: Array<number | string>): Buffer {
  return Buffer.concat(
    values.map((value) =>
      typeof value === "string" ? Buffer.from(value, "latin1") : Buffer.from([value]),
    ),
  );
}

describe("sniffMimeType", () => {
  it("reconhece PNG pela assinatura", () => {
    expect(sniffMimeType(bytes(0x89, "PNG\r\n", 0x1a, 0x0a, "resto"))).toBe(
      "image/png",
    );
  });

  it("reconhece JPEG", () => {
    expect(sniffMimeType(bytes(0xff, 0xd8, 0xff, 0xe0, "JFIF"))).toBe("image/jpeg");
  });

  it("reconhece GIF nas duas versões", () => {
    expect(sniffMimeType(bytes("GIF87a", "resto"))).toBe("image/gif");
    expect(sniffMimeType(bytes("GIF89a", "resto"))).toBe("image/gif");
  });

  it("reconhece WebP pelo marcador no offset 8", () => {
    expect(sniffMimeType(bytes("RIFF", "\0\0\0\0", "WEBP", "VP8 "))).toBe(
      "image/webp",
    );
  });

  it("separa MP4 de MOV pela marca do contêiner", () => {
    expect(sniffMimeType(bytes("\0\0\0\x18", "ftyp", "isom"))).toBe("video/mp4");
    expect(sniffMimeType(bytes("\0\0\0\x14", "ftyp", "qt  "))).toBe(
      "video/quicktime",
    );
  });

  it("reconhece PDF", () => {
    expect(sniffMimeType(bytes("%PDF-1.7\n"))).toBe("application/pdf");
  });

  it("recusa SVG, mesmo sendo um tipo image/*", () => {
    const svg = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );

    expect(sniffMimeType(svg)).toBeNull();
  });

  it("recusa HTML disfarçado de imagem", () => {
    expect(sniffMimeType(Buffer.from("<!doctype html><script>"))).toBeNull();
  });

  it("recusa conteúdo vazio ou curto demais para ter assinatura", () => {
    expect(sniffMimeType(Buffer.alloc(0))).toBeNull();
    expect(sniffMimeType(bytes(0x89, "PN"))).toBeNull();
  });
});

describe("canBeServedInline", () => {
  it("libera apenas os tipos verificados por assinatura", () => {
    expect(canBeServedInline("image/png")).toBe(true);
    expect(canBeServedInline("application/pdf")).toBe(true);
  });

  it("não libera tipos que executam script", () => {
    expect(canBeServedInline("image/svg+xml")).toBe(false);
    expect(canBeServedInline("text/html")).toBe(false);
  });
});

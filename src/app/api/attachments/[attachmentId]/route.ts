import { NextResponse } from "next/server";

import { canBeServedInline, readAttachmentFile } from "@/lib/attachments";
import {
  AuthenticationError,
  AuthorizationError,
  getAttachmentForDownload,
  ResourceNotFoundError,
} from "@/lib/dal";

/**
 * Monta o cabeçalho conforme a RFC 6266: um `filename` ASCII para clientes
 * antigos e um `filename*` percent-encoded que preserva acentos.
 */
function contentDisposition(fileName: string, inline: boolean): string {
  const asciiFallback =
    Array.from(fileName)
      .map((char) => {
        const code = char.codePointAt(0) ?? 0;
        return code > 31 && code < 127 && char !== '"' && char !== "\\"
          ? char
          : "_";
      })
      .join("")
      .slice(0, 200) || "arquivo";

  const disposition = inline ? "inline" : "attachment";

  return `${disposition}; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ attachmentId: string }> },
) {
  const { attachmentId } = await params;

  try {
    const attachment = await getAttachmentForDownload(attachmentId);
    const file = await readAttachmentFile(attachment.storageKey);

    // Download é o padrão. A pré-visualização só acontece a pedido explícito e
    // apenas para formatos cujo conteúdo foi verificado por assinatura no
    // upload — nunca com base no que o cliente declarou.
    const wantsInline =
      new URL(request.url).searchParams.get("inline") === "1" &&
      canBeServedInline(attachment.mimeType);

    return new NextResponse(new Uint8Array(file), {
      headers: {
        "Content-Type": attachment.mimeType,
        "Content-Disposition": contentDisposition(
          attachment.fileName,
          wantsInline,
        ),
        "Content-Length": String(file.byteLength),
        "Cache-Control": "private, no-store",
        // Impede o navegador de adivinhar um tipo diferente do declarado.
        "X-Content-Type-Options": "nosniff",
        // Segunda linha de defesa: mesmo que algum formato executável passasse
        // pela verificação de assinatura, o sandbox bloqueia scripts e o
        // `default-src 'none'` corta qualquer requisição a partir do arquivo.
        "Content-Security-Policy": "default-src 'none'; sandbox",
      },
    });
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }
    if (error instanceof AuthorizationError) {
      return NextResponse.json({ error: "Sem acesso a este anexo." }, { status: 403 });
    }
    if (error instanceof ResourceNotFoundError) {
      return NextResponse.json({ error: "Anexo não encontrado." }, { status: 404 });
    }
    return NextResponse.json({ error: "Não foi possível baixar o anexo." }, { status: 500 });
  }
}

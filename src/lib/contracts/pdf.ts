import "server-only";

import PDFDocument from "pdfkit";

import { CONTRACT_IMAGES } from "@/lib/contracts/assets.generated";
import type {
  ContractDocument,
  DocBlock,
  Span,
} from "@/lib/contracts/compose";

/**
 * Desenha o contrato em PDF.
 *
 * A quebra de linha e a justificação são feitas aqui, e não pelo `text()`
 * contínuo do PDFKit, porque o contrato mistura negrito e itálico no meio do
 * parágrafo e o PDFKit não justifica de forma confiável trechos com fontes
 * diferentes. Medir cada palavra e distribuir o espaço sobra dá controle total
 * e resultado previsível.
 *
 * Usa as fontes padrão do PDF (Times e Helvetica): não há arquivo de fonte para
 * empacotar, e Times tem as mesmas métricas do Times New Roman dos contratos
 * originais.
 */

const PAGE = { width: 595.28, height: 841.89 };
const MARGIN_LEFT = 36;
const MARGIN_RIGHT = 36;
const CONTENT_WIDTH = PAGE.width - MARGIN_LEFT - MARGIN_RIGHT;
const CONTENT_TOP = 88;
const CONTENT_BOTTOM = 772;

const FONT_SIZE = 12;
const LINE_HEIGHT = 19;
const NUMBER_COLUMN = 46;
const TABLE_PADDING = 5;

const LOGO_BOX = { width: 120, height: 62, top: 8 };
const FOOTER_BOTTOM = 832;

const LINK_COLOR = "#0563c1";
const TITLE_COLOR = "#008080";

type Style = { bold: boolean; italic: boolean; link: boolean };
type Fragment = { text: string; style: Style; width: number };
type Chunk = { fragments: Fragment[]; width: number };

/**
 * As fontes padrão do PDF cobrem Latin-1 e alguns sinais do Windows-1252.
 * Qualquer outro caractere sairia como lixo; troca pela letra sem acento ou,
 * se não houver, por "?" — melhor um sinal visível na revisão que um símbolo
 * quebrado dentro de um contrato.
 */
const WIN_ANSI_EXTRA = new Set(
  [..."€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ"].map((char) => char.codePointAt(0)),
);

export function toWinAnsi(text: string): string {
  let result = "";

  for (const char of text.normalize("NFC")) {
    const code = char.codePointAt(0) ?? 0;

    if (code === 0x09 || code === 0x0a) {
      result += " ";
    } else if (code >= 0x20 && code <= 0x7e) {
      result += char;
    } else if (code >= 0xa0 && code <= 0xff) {
      result += char;
    } else if (WIN_ANSI_EXTRA.has(code)) {
      result += char;
    } else {
      const base = char.normalize("NFD").replace(/[̀-ͯ]/g, "");
      result += /^[\x20-\x7e]$/.test(base) ? base : "?";
    }
  }

  return result;
}

function fontName(style: Style): string {
  if (style.bold && style.italic) return "Times-BoldItalic";
  if (style.bold) return "Times-Bold";
  if (style.italic) return "Times-Italic";
  return "Times-Roman";
}

const REGULAR: Style = { bold: false, italic: false, link: false };

class ContractPainter {
  readonly pdf: PDFKit.PDFDocument;
  private y = CONTENT_TOP;
  private readonly widthCache = new Map<string, number>();
  private readonly spaceWidth: number;

  constructor(private readonly document: ContractDocument) {
    this.pdf = new PDFDocument({
      size: "A4",
      margins: { top: 0, bottom: 0, left: 0, right: 0 },
      bufferPages: true,
      info: {
        Title: "Contrato de prestação de serviço de coleta de resíduos",
        Author: document.company.legalName,
        Subject: "Contrato de prestação de serviço",
      },
    });
    this.spaceWidth = this.measure(" ", REGULAR);
  }

  private measure(text: string, style: Style): number {
    const key = `${fontName(style)}|${text}`;
    const cached = this.widthCache.get(key);

    if (cached !== undefined) return cached;

    const width = this.pdf.font(fontName(style)).fontSize(FONT_SIZE).widthOfString(text);
    this.widthCache.set(key, width);

    return width;
  }

  // -- texto ---------------------------------------------------------------

  /** Junta os trechos em "palavras" — sequências sem espaço, que não podem ser quebradas. */
  private toChunks(spans: Span[]): Chunk[] {
    const chunks: Chunk[] = [];
    let current: Chunk | null = null;

    for (const span of spans) {
      const style: Style = {
        bold: span.bold,
        italic: span.italic,
        link: span.link,
      };

      for (const part of toWinAnsi(span.text).split(/(\s+)/)) {
        if (part === "") continue;

        if (/^\s+$/.test(part)) {
          if (current) chunks.push(current);
          current = null;
          continue;
        }

        const fragment: Fragment = {
          text: part,
          style,
          width: this.measure(part, style),
        };

        if (!current) current = { fragments: [], width: 0 };

        current.fragments.push(fragment);
        current.width += fragment.width;
      }
    }

    if (current) chunks.push(current);

    return chunks;
  }

  /** Quebra uma palavra mais larga que a linha, para nunca vazar da página. */
  private splitOversized(chunk: Chunk, maxWidth: number): Chunk[] {
    if (chunk.width <= maxWidth) return [chunk];

    const pieces: Chunk[] = [];
    let current: Chunk = { fragments: [], width: 0 };

    for (const fragment of chunk.fragments) {
      let pending = "";

      for (const char of fragment.text) {
        const overflows =
          current.width + this.measure(pending + char, fragment.style) > maxWidth;

        if (overflows && (pending || current.fragments.length)) {
          if (pending) {
            current.fragments.push({
              text: pending,
              style: fragment.style,
              width: this.measure(pending, fragment.style),
            });
            current.width += this.measure(pending, fragment.style);
          }
          pieces.push(current);
          current = { fragments: [], width: 0 };
          pending = "";
        }

        pending += char;
      }

      if (pending) {
        const width = this.measure(pending, fragment.style);
        current.fragments.push({ text: pending, style: fragment.style, width });
        current.width += width;
      }
    }

    if (current.fragments.length) pieces.push(current);

    return pieces;
  }

  private breakLines(chunks: Chunk[], maxWidth: number): Chunk[][] {
    const lines: Chunk[][] = [];
    let line: Chunk[] = [];
    let lineWidth = 0;

    for (const chunk of chunks.flatMap((c) => this.splitOversized(c, maxWidth))) {
      const extra = line.length === 0 ? chunk.width : this.spaceWidth + chunk.width;

      if (line.length > 0 && lineWidth + extra > maxWidth) {
        lines.push(line);
        line = [chunk];
        lineWidth = chunk.width;
      } else {
        line.push(chunk);
        lineWidth += extra;
      }
    }

    if (line.length) lines.push(line);

    return lines;
  }

  private drawLine(
    line: Chunk[],
    x: number,
    y: number,
    maxWidth: number,
    mode: "justify" | "left" | "center" | "right",
  ) {
    const natural =
      line.reduce((sum, chunk) => sum + chunk.width, 0) +
      this.spaceWidth * (line.length - 1);

    let gap = this.spaceWidth;
    let startX = x;

    if (mode === "justify" && line.length > 1) {
      gap = this.spaceWidth + (maxWidth - natural) / (line.length - 1);
    } else if (mode === "center") {
      startX = x + (maxWidth - natural) / 2;
    } else if (mode === "right") {
      startX = x + maxWidth - natural;
    }

    let cursor = startX;

    for (const chunk of line) {
      for (const fragment of chunk.fragments) {
        const style = fragment.style;

        this.pdf
          .font(fontName(style))
          .fontSize(FONT_SIZE)
          .fillColor(style.link ? LINK_COLOR : "#000000")
          .text(fragment.text, cursor, y, {
            lineBreak: false,
            underline: style.link,
            link: style.link ? fragment.text : undefined,
          });

        cursor += fragment.width;
      }

      cursor += gap;
    }

    this.pdf.fillColor("#000000");
  }

  // -- fluxo de páginas -------------------------------------------------------

  private newPage() {
    this.pdf.addPage();
    this.y = CONTENT_TOP;
  }

  private linesThatFit(): number {
    return Math.max(0, Math.floor((CONTENT_BOTTOM - this.y) / LINE_HEIGHT));
  }

  /** Garante `height` pontos livres; senão começa outra página. */
  private ensureSpace(height: number) {
    if (this.y + height > CONTENT_BOTTOM) this.newPage();
  }

  /**
   * Desenha um parágrafo com recuo, número pendurado e justificação. Evita
   * deixar uma linha sozinha no pé ou no topo da página.
   */
  private paragraph(
    spans: Span[],
    options: {
      left: number;
      number?: string;
      justify?: boolean;
      /** Linhas do bloco seguinte que devem caber junto (títulos). */
      keepWithNext?: number;
    },
  ) {
    const width = PAGE.width - MARGIN_RIGHT - options.left;
    const lines = this.breakLines(this.toChunks(spans), width);

    if (lines.length === 0) return;

    const fit = this.linesThatFit();
    const needed = lines.length + (options.keepWithNext ?? 0);

    if (lines.length <= 3 && fit < needed) {
      // Parágrafo curto não se parte entre páginas.
      this.newPage();
    } else if (fit < 2 && lines.length > 1) {
      // Órfã: uma linha só no pé da página.
      this.newPage();
    }

    let index = 0;

    while (index < lines.length) {
      let capacity = this.linesThatFit();

      if (capacity === 0) {
        this.newPage();
        capacity = this.linesThatFit();
      }

      // Viúva: se a quebra deixaria exatamente uma linha para a página
      // seguinte, antecipa a quebra em uma linha.
      let take = Math.min(capacity, lines.length - index);
      const remaining = lines.length - index - take;

      if (remaining === 1 && take > 2) take -= 1;

      for (let offset = 0; offset < take; offset += 1) {
        const isFirst = index + offset === 0;
        const isLast = index + offset === lines.length - 1;

        if (isFirst && options.number) {
          this.pdf
            .font("Times-Roman")
            .fontSize(FONT_SIZE)
            .fillColor("#000000")
            .text(toWinAnsi(options.number), MARGIN_LEFT, this.y, {
              lineBreak: false,
            });
        }

        this.drawLine(
          lines[index + offset],
          options.left,
          this.y,
          width,
          options.justify && !isLast ? "justify" : "left",
        );
        this.y += LINE_HEIGHT;
      }

      index += take;

      if (index < lines.length) this.newPage();
    }
  }

  // -- blocos ----------------------------------------------------------------

  private title() {
    const chunks = this.toChunks([
      { text: this.document.title, bold: true, italic: false, link: false },
    ]);
    const width = 460;
    const lines = this.breakLines(chunks, width);
    const left = MARGIN_LEFT + (CONTENT_WIDTH - width) / 2;

    for (const line of lines) {
      const text = line
        .map((chunk) => chunk.fragments.map((f) => f.text).join(""))
        .join(" ");

      this.pdf
        .font("Times-Bold")
        .fontSize(FONT_SIZE)
        .fillColor(TITLE_COLOR)
        .text(text, left, this.y, {
          width,
          align: "center",
          underline: true,
          lineBreak: false,
        });
      this.y += LINE_HEIGHT;
    }

    this.pdf.fillColor("#000000");
    this.y += 10;
  }

  private heading(spans: Span[]) {
    this.y += 12;
    // Título nunca fica sozinho no pé da página: leva junto as 2 primeiras
    // linhas do que vem depois.
    if (this.linesThatFit() < 4) this.newPage();

    this.paragraph(spans, { left: MARGIN_LEFT, justify: false });
    this.y += 4;
  }

  private table(rows: Array<[Span[], Span[]]>) {
    const labelWidth = 150;
    const valueWidth = CONTENT_WIDTH - labelWidth;
    const left = MARGIN_LEFT;

    this.y += 6;

    for (const [label, value] of rows) {
      const labelLines = this.breakLines(this.toChunks(label), labelWidth - TABLE_PADDING * 2);
      const valueLines = this.breakLines(this.toChunks(value), valueWidth - TABLE_PADDING * 2);
      const lineCount = Math.max(labelLines.length, valueLines.length);
      const height = lineCount * LINE_HEIGHT + TABLE_PADDING;

      this.ensureSpace(height);

      this.pdf
        .lineWidth(0.6)
        .strokeColor("#000000")
        .rect(left, this.y, labelWidth, height)
        .stroke()
        .rect(left + labelWidth, this.y, valueWidth, height)
        .stroke();

      labelLines.forEach((line, index) =>
        this.drawLine(
          line,
          left + TABLE_PADDING,
          this.y + TABLE_PADDING / 2 + index * LINE_HEIGHT,
          labelWidth - TABLE_PADDING * 2,
          "left",
        ),
      );
      valueLines.forEach((line, index) =>
        this.drawLine(
          line,
          left + labelWidth + TABLE_PADDING,
          this.y + TABLE_PADDING / 2 + index * LINE_HEIGHT,
          valueWidth - TABLE_PADDING * 2,
          "left",
        ),
      );

      this.y += height;
    }

    this.y += 8;
  }

  private static readonly PARTY_BLOCK = 78;
  private static readonly WITNESS_BLOCK = 70;

  /** Altura que o bloco de assinaturas ocupa, para decidir se cabe na página. */
  private signaturesHeight(): number {
    const { parties, witnesses } = this.document.signature;

    return (
      24 +
      40 +
      parties.length * ContractPainter.PARTY_BLOCK +
      (witnesses ? ContractPainter.WITNESS_BLOCK : 0)
    );
  }

  private signatures() {
    const { place, parties, witnesses } = this.document.signature;
    const witnessBlock = ContractPainter.WITNESS_BLOCK;

    this.y += 24;
    this.ensureSpace(this.signaturesHeight() - 24);

    this.pdf
      .font("Times-Roman")
      .fontSize(FONT_SIZE)
      .fillColor("#000000")
      .text(toWinAnsi(place), MARGIN_LEFT, this.y, {
        width: CONTENT_WIDTH,
        align: "right",
        lineBreak: false,
      });
    this.y += 52;

    const lineWidth = 280;
    const lineLeft = MARGIN_LEFT + (CONTENT_WIDTH - lineWidth) / 2;

    for (const party of parties) {
      this.pdf
        .lineWidth(0.8)
        .strokeColor("#000000")
        .moveTo(lineLeft, this.y)
        .lineTo(lineLeft + lineWidth, this.y)
        .stroke();
      this.y += 5;

      const nameLines = this.breakLines(
        this.toChunks([{ text: party.name, bold: true, italic: false, link: false }]),
        lineWidth + 60,
      );

      for (const line of nameLines) {
        this.drawLine(line, lineLeft - 30, this.y, lineWidth + 60, "center");
        this.y += LINE_HEIGHT - 2;
      }

      this.drawLine(
        this.breakLines(
          this.toChunks([
            { text: `${party.documentLabel}: ${party.cnpj}`, bold: false, italic: false, link: false },
          ]),
          lineWidth + 60,
        )[0],
        lineLeft - 30,
        this.y,
        lineWidth + 60,
        "center",
      );
      this.y += LINE_HEIGHT + 34;
    }

    if (witnesses) {
      const columnWidth = 200;
      const columns = [MARGIN_LEFT + 20, MARGIN_LEFT + CONTENT_WIDTH - columnWidth - 20];

      this.ensureSpace(witnessBlock - 30);

      columns.forEach((x, index) => {
        this.pdf
          .lineWidth(0.8)
          .strokeColor("#000000")
          .moveTo(x, this.y + 18)
          .lineTo(x + columnWidth, this.y + 18)
          .stroke();
        this.pdf
          .font("Times-Roman")
          .fontSize(FONT_SIZE)
          .text(`0${index + 1}. Testemunha:`, x, this.y + 24, { lineBreak: false });
      });
      this.y += witnessBlock - 30;
    }
  }

  // -- cabeçalho e rodapé -------------------------------------------------------

  private decoratePages() {
    const { logo, footer } = this.document.company;
    const logoImage = CONTRACT_IMAGES[logo];
    const footerImage = CONTRACT_IMAGES[footer];
    const range = this.pdf.bufferedPageRange();

    const logoScale = Math.min(
      LOGO_BOX.width / logoImage.width,
      LOGO_BOX.height / logoImage.height,
    );
    const logoWidth = logoImage.width * logoScale;
    const logoHeight = logoImage.height * logoScale;
    const footerHeight = (CONTENT_WIDTH * footerImage.height) / footerImage.width;
    const footerTop = FOOTER_BOTTOM - footerHeight;

    // Passadas como data URI: o PDFKit guarda a imagem no registro pela própria
    // string e a embute uma única vez, mesmo desenhada em todas as páginas.
    // Um Buffer seria embutido de novo a cada página.
    const logoSource = `data:image/jpeg;base64,${logoImage.base64}`;
    const footerSource = `data:image/jpeg;base64,${footerImage.base64}`;

    for (let index = 0; index < range.count; index += 1) {
      this.pdf.switchToPage(range.start + index);

      this.pdf.image(
        logoSource,
        PAGE.width - MARGIN_RIGHT - logoWidth,
        LOGO_BOX.top,
        { width: logoWidth, height: logoHeight },
      );

      this.pdf.image(footerSource, MARGIN_LEFT, footerTop, {
        width: CONTENT_WIDTH,
        height: footerHeight,
      });

      const label = `Página ${index + 1} de ${range.count}`;

      this.pdf
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#333333")
        .text(label, MARGIN_LEFT, footerTop - 16, {
          width: CONTENT_WIDTH,
          align: "right",
          lineBreak: false,
        });
    }
  }

  // -- documento ---------------------------------------------------------------

  paint(): void {
    this.title();

    this.paragraph(this.document.intro, { left: MARGIN_LEFT, justify: true });
    this.y += 6;

    const { blocks } = this.document;

    blocks.forEach((block, index) => {
      // Uma folha só com assinaturas permitiria trocar o texto sem que as
      // assinaturas denunciassem: o último trecho do contrato viaja junto delas.
      if (index === blocks.length - 1 && block.kind === "item") {
        const lines = this.breakLines(
          this.toChunks(block.spans),
          PAGE.width - MARGIN_RIGHT - MARGIN_LEFT,
        );

        this.ensureSpace(lines.length * LINE_HEIGHT + this.signaturesHeight());
      }

      this.paintBlock(block);
    });

    this.signatures();
    this.decoratePages();
  }

  private paintBlock(block: DocBlock) {
    if (block.kind === "heading") {
      this.heading(block.spans);
    } else if (block.kind === "table") {
      this.table(block.rows);
    } else if (block.num) {
      this.paragraph(block.spans, {
        left: MARGIN_LEFT + NUMBER_COLUMN,
        number: block.num,
        justify: true,
      });
    } else {
      this.paragraph(block.spans, {
        left: block.indent ? MARGIN_LEFT + NUMBER_COLUMN : MARGIN_LEFT,
        justify: true,
      });
    }
  }
}

/** Gera o PDF do contrato e devolve os bytes. */
export function renderContractPdf(document: ContractDocument): Promise<Buffer> {
  const painter = new ContractPainter(document);

  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    painter.pdf.on("data", (chunk: Buffer) => chunks.push(chunk));
    painter.pdf.on("end", () => resolve(Buffer.concat(chunks)));
    painter.pdf.on("error", reject);

    try {
      painter.paint();
      painter.pdf.end();
    } catch (error) {
      reject(error);
    }
  });
}

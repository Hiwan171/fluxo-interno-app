/**
 * Chave do tema escolhido pela pessoa. Vive num módulo neutro porque é lida dos
 * dois lados: pelo script inline do layout (servidor) e pelo botão de alternar
 * (cliente). Importar a constante de um módulo `"use client"` dentro do layout
 * funcionaria, mas amarraria o layout a um limite de cliente sem necessidade.
 */
export const THEME_STORAGE_KEY = "fluxo-tema";

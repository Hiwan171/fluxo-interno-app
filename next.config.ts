import type { NextConfig } from "next";

/**
 * Content-Security-Policy.
 *
 * `'unsafe-inline'` em `style-src` é exigido pelo Next e pelo Radix, que
 * aplicam estilos inline para posicionar camadas flutuantes. Em `script-src`
 * ele cobre os scripts de inicialização que o Next injeta no HTML; trocá-lo por
 * nonce exige gerar o valor no proxy e repassá-lo a cada resposta — vale a pena
 * depois, mas a política abaixo já corta a classe de ataque que interessa aqui,
 * porque `object-src 'none'`, `frame-ancestors 'none'` e `base-uri 'self'`
 * fecham os vetores de injeção de conteúdo ativo.
 *
 * `fonts.googleapis.com` e `fonts.gstatic.com` estão liberados porque o layout
 * carrega Geist por `next/font/google`.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

/**
 * Os mesmos cabeçalhos existem no Caddyfile. Repetir aqui é deliberado: sem
 * isto, tirar o Caddy da frente — um teste local, um docker compose direto —
 * removeria silenciosamente toda a proteção.
 */
const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CONTENT_SECURITY_POLICY },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), geolocation=(), microphone=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  // O cabeçalho só anuncia a stack para quem estiver mapeando alvos.
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "20mb",
    },
  },
  async headers() {
    return [
      { source: "/:path*", headers: SECURITY_HEADERS },
      // Precisa vir depois da regra geral: quando duas regras casam o mesmo
      // caminho e definem a mesma chave, a última vence. Sem esta entrada, a
      // política ampla do app substituía a política restrita que a rota de
      // anexos define, e o sandbox — a defesa que impede um arquivo de
      // executar script mesmo se passasse pela verificação de assinatura —
      // simplesmente não chegava ao navegador.
      {
        source: "/api/attachments/:path*",
        headers: [
          {
            key: "Content-Security-Policy",
            value: "default-src 'none'; sandbox",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      },
    ];
  },
};

export default nextConfig;

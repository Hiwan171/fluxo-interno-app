import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

import { THEME_STORAGE_KEY } from "@/lib/theme";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Fluxo Interno",
  description: "Centralize solicitações, mensagens e responsáveis em um só fluxo.",
};

export const viewport: Viewport = {
  // Faz o navegador desenhar barra de rolagem, campos e menus nativos no tom
  // certo. Sem isto o tema escuro fica com controles nativos claros no meio.
  colorScheme: "light dark",
};

/**
 * Aplica o tema antes da primeira pintura. Precisa ser um script bloqueante no
 * topo do body: se esperasse o React montar, todo mundo que escolheu escuro
 * veria um lampejo branco a cada navegação.
 *
 * Sem escolha salva, segue a preferência do sistema operacional.
 */
const themeScript = `
try {
  var escolha = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
  var escuro = escolha
    ? escolha === "escuro"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;
  if (escuro) document.documentElement.classList.add("dark");
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      // O script acima mexe no className antes da hidratação; sem isto o React
      // reclama de divergência entre servidor e cliente em toda página.
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { MoonIcon, SunIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { THEME_STORAGE_KEY } from "@/lib/theme";

/**
 * O tema não mora no estado do React: mora numa classe `dark` no <html>,
 * escrita pelo script inline do layout antes da primeira pintura. Este
 * componente lê essa fonte externa em vez de manter uma cópia — copiar para
 * dentro de um `useState` dentro de efeito produziria render em cascata e
 * abriria a janela em que os dois discordam.
 */

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): boolean {
  return document.documentElement.classList.contains("dark");
}

/**
 * No servidor não existe classe para consultar. Devolver `false` casa com o
 * HTML entregue; quando a escolha for escura, o script inline já corrigiu a
 * classe antes de qualquer pixel aparecer, e a primeira leitura no navegador
 * ajusta o ícone.
 */
function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  function toggleTheme() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);

    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, next ? "escuro" : "claro");
    } catch {
      // Navegação privativa ou storage bloqueado: a troca vale só para esta aba.
    }

    for (const notify of listeners) notify();
  }

  const label = isDark ? "Usar tema claro" : "Usar tema escuro";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      onClick={toggleTheme}
      aria-label={label}
      title={label}
    >
      {isDark ? <SunIcon /> : <MoonIcon />}
    </Button>
  );
}

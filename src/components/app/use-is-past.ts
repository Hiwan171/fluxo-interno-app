"use client"

import { useSyncExternalStore } from "react"

/**
 * Relógio compartilhado por todos os cards.
 *
 * O prazo de permanência numa fase é dado puro (entrada + minutos configurados),
 * mas decidir se já passou exige ler a hora — e ler a hora durante o render
 * congelaria a resposta no instante em que a página foi montada: um card que
 * estoura o prazo com a tela aberta nunca mostraria o aviso.
 *
 * Um único intervalo alimenta todas as assinaturas, então o custo não cresce
 * com o número de cards no quadro.
 */

const TICK_INTERVAL_MS = 30_000;

const listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;
let snapshot = Date.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);

  if (!interval) {
    interval = setInterval(() => {
      snapshot = Date.now();
      for (const notify of listeners) notify();
    }, TICK_INTERVAL_MS);
  }

  return () => {
    listeners.delete(listener);

    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
    }
  };
}

function getSnapshot(): number {
  return snapshot;
}

/**
 * No servidor não há relógio a acompanhar: devolve o início da era para que
 * nenhum prazo apareça como vencido antes da hidratação, evitando divergência
 * entre o HTML enviado e o primeiro render no navegador.
 */
function getServerSnapshot(): number {
  return 0;
}

export function useIsPast(deadline: string | null | undefined): boolean {
  const now = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!deadline) return false;

  const target = Date.parse(deadline);

  return Number.isFinite(target) && now > target;
}

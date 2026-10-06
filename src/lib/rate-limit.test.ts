import { beforeEach, describe, expect, it, vi } from "vitest";

import { clientIdentifier, consumeRateLimit } from "@/lib/rate-limit";

describe("consumeRateLimit", () => {
  beforeEach(() => {
    globalThis.__fluxoRateLimitBuckets = new Map();
    vi.useRealTimers();
  });

  it("permite até o limite e recusa depois", () => {
    for (let attempt = 0; attempt < 3; attempt++) {
      expect(consumeRateLimit("k", 3, 60).allowed).toBe(true);
    }

    const blocked = consumeRateLimit("k", 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("conta cada chave separadamente", () => {
    expect(consumeRateLimit("a", 1, 60).allowed).toBe(true);
    expect(consumeRateLimit("a", 1, 60).allowed).toBe(false);
    expect(consumeRateLimit("b", 1, 60).allowed).toBe(true);
  });

  it("reabre a janela depois que ela expira", () => {
    vi.useFakeTimers();

    expect(consumeRateLimit("k", 1, 60).allowed).toBe(true);
    expect(consumeRateLimit("k", 1, 60).allowed).toBe(false);

    vi.advanceTimersByTime(61_000);
    expect(consumeRateLimit("k", 1, 60).allowed).toBe(true);
  });
});

describe("clientIdentifier", () => {
  it("usa o último valor de X-Forwarded-For", () => {
    // O Caddy acrescenta o endereço real ao final. Ler o primeiro deixaria
    // qualquer um escapar do limite mandando o cabeçalho na mão.
    const headers = new Headers({
      "x-forwarded-for": "1.2.3.4, 203.0.113.9",
    });

    expect(clientIdentifier(headers)).toBe("203.0.113.9");
  });

  it("cai para x-real-ip quando não há forwarded-for", () => {
    expect(clientIdentifier(new Headers({ "x-real-ip": "10.0.0.1" }))).toBe(
      "10.0.0.1",
    );
  });

  it("devolve um marcador quando não há cabeçalho algum", () => {
    expect(clientIdentifier(new Headers())).toBe("desconhecido");
  });
});

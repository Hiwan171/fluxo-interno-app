import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { proxy } from "@/proxy";

function request(path: string, cookie?: string): NextRequest {
  return new NextRequest(`http://localhost:3000${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("manda para o login quem não tem cookie de sessão", () => {
    const response = proxy(request("/boards/1"));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fboards%2F1",
    );
  });

  it("deixa o login abrir mesmo com cookie, para a página decidir se a sessão vale", () => {
    // Cookie de sessão já encerrada: redirecionar daqui para "/" fazia "/"
    // mandar de volta para /login, num laço sem fim.
    const response = proxy(request("/login", "fluxo_session=sessao-encerrada"));

    expect(response.headers.get("location")).toBeNull();
    expect(response.status).toBe(200);
  });

  it("deixa passar o formulário público e a definição de senha sem sessão", () => {
    expect(proxy(request("/f/abc123")).headers.get("location")).toBeNull();
    expect(proxy(request("/definir-senha/token")).headers.get("location")).toBeNull();
  });

  it("deixa passar quem tem cookie numa rota protegida (a página valida a sessão)", () => {
    const response = proxy(request("/boards/1", "fluxo_session=qualquer"));
    expect(response.headers.get("location")).toBeNull();
  });
});

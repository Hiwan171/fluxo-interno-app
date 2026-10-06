import { describe, expect, it } from "vitest";

import { HONEYPOT_FIELD_NAME, isHoneypotTripped } from "@/lib/honeypot";

describe("isHoneypotTripped", () => {
  it("não dispara quando o campo-isca não vem no envio", () => {
    const formData = new FormData();
    formData.set("titulo", "Preciso de acesso");

    expect(isHoneypotTripped(formData)).toBe(false);
  });

  it("não dispara quando o campo vem vazio ou só com espaços", () => {
    const empty = new FormData();
    empty.set(HONEYPOT_FIELD_NAME, "");
    const blank = new FormData();
    blank.set(HONEYPOT_FIELD_NAME, "   ");

    expect(isHoneypotTripped(empty)).toBe(false);
    expect(isHoneypotTripped(blank)).toBe(false);
  });

  it("dispara quando o campo vem preenchido", () => {
    const formData = new FormData();
    formData.set(HONEYPOT_FIELD_NAME, "http://spam.example");

    expect(isHoneypotTripped(formData)).toBe(true);
  });

  it("dispara quando o campo-isca chega como arquivo", () => {
    const formData = new FormData();
    formData.set(HONEYPOT_FIELD_NAME, new File(["x"], "x.txt"));

    expect(isHoneypotTripped(formData)).toBe(true);
  });
});

/**
 * Campo-isca do formulário público.
 *
 * O campo existe no HTML mas fica fora da tela, e uma pessoa nunca o preenche.
 * Robôs que montam o POST a partir dos `<input>` da página preenchem tudo o que
 * encontram e entregam o próprio disfarce.
 *
 * O nome é deliberadamente neutro: algo como `website` ou `phone` seria
 * preenchido pelo autofill do navegador e descartaria o envio de gente de
 * verdade. Este módulo não importa `server-only` porque o formulário (cliente)
 * precisa do nome e a action (servidor) precisa da verificação.
 */
export const HONEYPOT_FIELD_NAME = "contato_secundario";

export function isHoneypotTripped(formData: FormData): boolean {
  const value = formData.get(HONEYPOT_FIELD_NAME);

  if (value === null) return false;
  if (typeof value === "string") return value.trim() !== "";

  // Um arquivo num campo que nunca deveria ser de arquivo.
  return true;
}

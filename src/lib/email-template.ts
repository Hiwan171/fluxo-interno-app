export type TemplateContext = Record<
  string,
  string | number | boolean | null | undefined
>;

export function renderEmailTemplate(template: string, context: TemplateContext) {
  return template.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_match, key: string) => {
    const value = context[key];
    return value === null || value === undefined ? "" : String(value);
  });
}


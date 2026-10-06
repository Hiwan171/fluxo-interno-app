import path from "node:path";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` existe para quebrar o build quando um módulo de servidor
      // vaza para o cliente. Fora do Next não há essa distinção, então aponta
      // para um módulo vazio e o teste consegue importar a lógica.
      "server-only": path.resolve(__dirname, "./src/test/server-only-stub.ts"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});

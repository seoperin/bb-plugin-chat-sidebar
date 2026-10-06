import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  // Rendering the list through bb's SDK harness can take seconds on a busy machine.
  test: { include: ["test/**/*.test.{ts,tsx}"], testTimeout: 20_000 },
});

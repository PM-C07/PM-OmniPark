import { loadEnv } from "vite";
import { defineConfig } from "vitest/config";

// Copertura dei test automatici sui componenti dei requisiti a priorità Alta (NRF_SUP_3, OMP-60):
// test unitari e test sul database in un'unica esecuzione (npm run test:copertura). I test sul
// database usano il database di test personale (DATABASE_URL_TEST), come npm run test:db: le
// variabili arrivano dal file .env e una variabile già presente nell'ambiente prevale.
const variabiliDaFile = Object.fromEntries(
  Object.entries(loadEnv("test", process.cwd(), "")).filter(
    ([nome]) => process.env[nome] === undefined,
  ),
);

export default defineConfig({
  test: {
    environment: "node",
    // I file sul database si ricreano a vicenda lo schema: nessun file in parallelo, in nessun project.
    fileParallelism: false,
    projects: [
      {
        test: {
          name: "unitari",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.db.test.ts", "**/node_modules/**"],
        },
      },
      {
        test: {
          name: "database",
          environment: "node",
          include: ["src/**/*.db.test.ts"],
          fileParallelism: false,
          env: variabiliDaFile,
          testTimeout: 30_000,
          hookTimeout: 120_000,
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary", "html"],
      reportsDirectory: "coverage/sistema",
      // Componenti dei requisiti Alta (docs/test/report_requisiti_non_funzionali.md, NRF_SUP_3).
      include: [
        "src/application/**/*.ts",
        "src/persistence/accessoDati/**/*.ts",
        "src/persistence/db.ts",
        "src/app/api/**/*.ts",
        "src/app/_composizione.ts",
        "src/presentation/logica/**/*.ts",
      ],
      exclude: [
        "**/*.test.ts",
        // RF_ADM_1 (Media): conteggio degli stalli per la panoramica degli enti.
        "src/application/gestione-stalli/conteggio.ts",
        // Infrastruttura: stato del database, non un requisito funzionale.
        "src/app/api/health/**",
      ],
      thresholds: { lines: 80, statements: 80 },
    },
  },
});

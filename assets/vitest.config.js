import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    /**
     * jsdom for the few tests that touch the DOM (measure,
     * fillCollapseProps). Pure-function tests don't pay any cost they'd
     * avoid with "node".
     */
    environment: "jsdom",
    include: ["test/**/*.test.js"],
  },
});

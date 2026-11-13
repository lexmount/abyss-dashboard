import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { routes } from "./routes";

describe("standalone route ownership", () => {
  it.each(["/docs", "/docs/product/overview/product-positioning"])(
    "resolves product documentation %s to the standalone not-found route",
    (pathname) => {
      expect(matchRoutes(routes, pathname)?.at(-1)?.route.path).toBe("*");
    },
  );

  it.each(["/dashboard", "/comparison", "/sessions", "/sessions/:sessionPk"])(
    "preserves the %s data workflow",
    (path) => {
      expect(
        matchRoutes(routes, path.replace(":sessionPk", "42"))?.at(-1)?.route.path,
      ).toBe(path);
    },
  );
});

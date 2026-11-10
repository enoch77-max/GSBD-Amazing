/**
 * Application assembly without side effects: safe to import from tests,
 * the server entry point and tooling alike.
 */
import { App, csrf, logger, securityHeaders } from "./http";
import { mountShop } from "./shop";
import { mountAdmin } from "./admin";
import { mountPages } from "./pages";
import { mountFeatures } from "./features";

export function createApp(): App {
  const app = new App();
  app.use(logger());
  app.use(securityHeaders());
  app.use(csrf());
  mountShop(app);
  mountAdmin(app);
  mountFeatures(app);
  mountPages(app);
  return app;
}

import { expect, type Page, type Route, test } from "@playwright/test";

const sessionUser = {
  id: "session-readiness-member",
  email: "member@example.test",
  role: "USER",
  profile: { fullName: "Test Member" },
};

async function respond(route: Route, status: number, body: unknown) {
  const headers = {
    "access-control-allow-origin": await route.request().headerValue("origin") || "*",
    "access-control-allow-credentials": "true",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-allow-methods": "GET, POST, OPTIONS",
  };
  await route.fulfill({ status, headers, json: body });
}

async function handlePreflight(route: Route) {
  if (route.request().method() !== "OPTIONS") return false;
  await respond(route, 204, undefined);
  return true;
}

function hydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|hydrated|server rendered|did not match/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

for (const locale of ["en-US", "ar-MA"]) {
  test.describe(`public landing with ${locale}`, () => {
    test.use({ locale });

    test("renders, animates and switches locale while session refresh is stalled", async ({ page }) => {
      const errors = hydrationErrors(page);
      let finishRefresh!: () => void;
      let startedRefresh!: () => void;
      const waiting = new Promise<void>((resolve) => { finishRefresh = resolve; });
      const started = new Promise<void>((resolve) => { startedRefresh = resolve; });
      let refreshRequests = 0;
      await page.route("**/auth/refresh", async (route) => {
        if (await handlePreflight(route)) return;
        refreshRequests += 1;
        startedRefresh();
        await waiting;
        await respond(route, 401, { message: "No active session" });
      });

      try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await started;
        const rtl = locale.startsWith("ar");
        await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await expect(page.getByRole("search")).toBeVisible();
        await expect(page.locator(".feature-marquee-track")).toBeVisible();
        await expect(page.locator("h1 > span.absolute")).not.toHaveText("");
        if ((page.viewportSize()?.width || 0) < 640) {
          await page.locator("header nav button[aria-expanded]").click();
        }
        await page.getByRole("button", { name: rtl ? /^(EN|English)$/ : "العربية", exact: true }).click();
        await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "ltr" : "rtl");
        expect(refreshRequests).toBe(1);
        expect(new URL(page.url()).pathname).toBe("/");
      } finally {
        finishRefresh();
      }
      await expect(page.getByRole("search")).toBeVisible();
      expect(errors).toEqual([]);
    });

    for (const failure of ["expired", "unavailable"] as const) {
      test(`keeps the landing page usable when session refresh is ${failure}`, async ({ page }) => {
        const errors = hydrationErrors(page);
        await page.route("**/auth/refresh", async (route) => {
          if (await handlePreflight(route)) return;
          if (failure === "unavailable") await route.abort("failed");
          else await respond(route, 401, { message: "Session expired" });
        });
        await page.goto("/");
        await expect(page.getByRole("search")).toBeVisible();
        await expect(page.locator(".feature-marquee-track")).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        expect(errors).toEqual([]);
      });
    }

    test("redirects to the protected dashboard after restoring a valid session", async ({ page }) => {
      const errors = hydrationErrors(page);
      let finishProfile!: () => void;
      let startedProfile!: () => void;
      const waiting = new Promise<void>((resolve) => { finishProfile = resolve; });
      const started = new Promise<void>((resolve) => { startedProfile = resolve; });
      await page.route("**/auth/refresh", async (route) => {
        if (await handlePreflight(route)) return;
        await respond(route, 200, { accessToken: "test-access-token", user: sessionUser });
      });
      await page.route("**/auth/profile", async (route) => {
        if (await handlePreflight(route)) return;
        startedProfile();
        await waiting;
        await respond(route, 200, sessionUser);
      });
      // Keep this UI regression isolated from dashboard data and real accounts.
      await page.route("**/dashboard", async (route) => {
        if (route.request().isNavigationRequest()) {
          await route.fulfill({ contentType: "text/html", body: "<h1>Dashboard destination</h1>" });
        } else await route.continue();
      });
      try {
        await page.goto("/", { waitUntil: "domcontentloaded" });
        await started;
        await expect(page.getByRole("search")).toBeVisible();
        expect(new URL(page.url()).pathname).toBe("/");
      } finally {
        finishProfile();
      }
      await expect(page).toHaveURL(/\/dashboard$/);
      expect(errors).toEqual([]);
    });
  });
}

test.describe("public server HTML", () => {
  test.use({ javaScriptEnabled: false });

  test("includes public content before JavaScript and authentication initialize", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("search")).toBeVisible();
    await expect(page.locator(".feature-marquee-track")).toBeVisible();
  });
});

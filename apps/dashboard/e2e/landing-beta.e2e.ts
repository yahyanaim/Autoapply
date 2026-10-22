import { expect, type Page, test } from "@playwright/test";

const headline = "You're on the list!";
const arabicHeadline = "أنت الآن على قائمة الانتظار!";

async function fillForm(page: Page) {
  await page.locator("#early-user-first-name").fill("Test");
  await page.locator("#early-user-email").fill("beta-ui@example.test");
  await page.locator("#early-user-country").fill("Morocco");
  await page.locator("#early-user-job-search-status").selectOption("actively-searching");
  await page.locator("#early-user-preferred-language").selectOption("french");
  await page.locator("#early-user-consent").check();
}

// Native anchor/focus scrolling can outlast locator actions. Observe the browser's
// scroll lifecycle instead of letting a fixed delay decide when geometry is safe.
async function waitForScrollEnd(page: Page) {
  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  }));
  await expect.poll(() => page.evaluate(() =>
    (window as Window & { __betaScrolling?: boolean }).__betaScrolling,
  )).toBe(false);
}

async function positionSubmit(page: Page, preferredTop: number) {
  const submit = page.locator('#early-beta button[type="submit"]');
  await waitForScrollEnd(page);
  const before = await submit.boundingBox();
  if (!before) throw new Error("Missing beta submit button");
  // A real wheel gesture creates the two user scroll positions under test.
  // Clamp at the document end, where the 768px footer limits further scrolling.
  const top = await page.evaluate((box) => Math.max(
    box.preferredTop,
    box.currentTop + scrollY - (document.documentElement.scrollHeight - innerHeight),
  ), { preferredTop, currentTop: before.y });
  await page.mouse.move(page.viewportSize()!.width - 4, 0);
  await page.mouse.wheel(0, before.y - top);
  await waitForScrollEnd(page);
  await expect.poll(async () => Math.abs((await submit.boundingBox())!.y - top)).toBeLessThanOrEqual(1);
  await expect(submit).toBeInViewport({ ratio: 1 });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as Window & { __betaScrolling?: boolean };
    state.__betaScrolling = false;
    addEventListener("scroll", () => { state.__betaScrolling = true; }, { passive: true });
    addEventListener("scrollend", () => { state.__betaScrolling = false; });
  });
  // All registration and AI traffic is local/mocked; never submit or infer live.
  await page.route("**/auth/refresh", (route) => route.abort());
  await page.route("**/career-chat/**", (route) => route.abort());
  await page.route("**/api/early-users", (route) => route.fulfill({ status: 200, json: { ok: true } }));
});

for (const locale of ["en-US", "ar-MA"]) {
  test.describe(`beta UX ${locale}`, () => {
    test.use({ locale });

    // The desktop project exercises every breakpoint; the mobile project adds
    // the actual touch/mobile context at its configured 390px width.
    for (const width of [375, 390, 640, 768, 1024, 1440]) {
      test(`${width}px navigation, form geometry and mocked confirmation`, async ({ page }, info) => {
        test.skip(info.project.name === "mobile" && width !== 390, "Breakpoint matrix runs in desktop; mobile also checks 390px touch.");
        await page.setViewportSize({ width, height: width >= 1024 ? 900 : 844 });
        const errors: string[] = [];
        page.on("pageerror", (error) => errors.push(error.message));
        await page.goto("/");
        const rtl = locale.startsWith("ar");
        await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
        const betaLink = page.locator('header a[href="#early-beta"]');
        await expect(betaLink).toBeVisible();
        expect(await betaLink.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(249, 115, 22)");
        const menu = page.locator('header button[aria-controls="landing-navigation-menu"]');
        if (width < 1280) {
          await menu.click();
          await expect(menu).toHaveAttribute("aria-expanded", "true");
          const links = page.locator("#landing-navigation-menu");
          for (const href of ["#features", "#how-it-works", "#jobs", "#pricing", "/extension/connect", "/login", "/register"]) {
            await expect(links.locator(`a[href="${href}"]`)).toBeVisible();
          }
        } else {
          await expect(menu).toBeHidden();
          await expect(page.locator('header a[href="/login"]').first()).toBeVisible();
          await expect(page.locator('header a[href="/register"]').first()).toBeVisible();
        }
        await betaLink.focus();
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/#early-beta$/);
        await expect(page.locator("#early-beta")).toBeFocused();
        await expect(page.locator("#landing-navigation-menu")).toHaveCount(0);
        await waitForScrollEnd(page);
        const form = page.locator("#early-beta form");
        await expect(form).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
        // Check the card bounds too: an overflow-hidden ancestor can conceal a bug.
        const fits = await form.evaluate((element) => {
          const card = element.closest(".section-shell > div")!.getBoundingClientRect();
          return Array.from(element.querySelectorAll("input:not([name=website]),select,textarea,button[type=submit]")).every((node) => {
            const r = node.getBoundingClientRect();
            return r.left >= card.left && r.right <= card.right && node.scrollWidth <= node.clientWidth + 1;
          });
        });
        expect(fits).toBe(true);
        const submit = form.locator('button[type="submit"]');
        expect(await submit.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(249, 115, 22)");
        await fillForm(page);
        // Here the centered confirmation is already within the viewport: success
        // should preserve the scroll position as well as the section geometry.
        await positionSubmit(page, 500);
        const before = await page.locator("#early-beta").boundingBox();
        const scrollBefore = await page.evaluate(() => scrollY);
        await submit.click();
        const success = page.getByRole("heading", { name: rtl ? arabicHeadline : headline, exact: true });
        await expect(success).toBeFocused();
        await expect(success).toBeInViewport({ ratio: 1 });
        await expect(form).toHaveAttribute("aria-hidden", "true");
        await expect(form).toHaveAttribute("inert", "");
        await expect(page.locator("#early-beta [role=status]")).toContainText(rtl ? "سنتواصل معك" : "We'll contact you by email");
        await expect(page.locator("[data-beta-success]")).not.toContainText("beta-ui@example.test");
        await page.locator("[data-beta-success]").evaluate(async (el) => {
          await Promise.all(el.getAnimations().map((animation) => animation.finished));
        });
        await waitForScrollEnd(page);
        const after = await page.locator("#early-beta").boundingBox();
        expect(Math.abs(after!.height - before!.height)).toBeLessThanOrEqual(1);
        expect(Math.abs(await page.evaluate(() => scrollY) - scrollBefore)).toBeLessThanOrEqual(1);
        await page.keyboard.press("Tab");
        const explore = page.locator('[data-beta-success] a[href="#features"]');
        await expect(explore).toBeFocused();
        expect(await explore.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe("none");
        await page.keyboard.press("Enter");
        await expect(page).toHaveURL(/#features$/);
        expect(errors).toEqual([]);
      });
    }

    for (const width of [640, 768]) {
      for (const reducedMotion of ["no-preference", "reduce"] as const) {
        test(`${width}px offscreen confirmation follows focus (${reducedMotion})`, async ({ page }, info) => {
          test.skip(info.project.name === "mobile", "Tablet regression runs in the desktop breakpoint matrix.");
          await page.setViewportSize({ width, height: 844 });
          await page.emulateMedia({ reducedMotion });
          await page.goto("/");
          const rtl = locale.startsWith("ar");
          await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
          await page.locator('header a[href="#early-beta"]').focus();
          await page.keyboard.press("Enter");
          await expect(page.locator("#early-beta")).toBeFocused();
          await waitForScrollEnd(page);
          await fillForm(page);
          // This is the reproduced failure: Submit remains visible, while the
          // unchanged confirmation layout places its heading above the viewport.
          await positionSubmit(page, 100);
          const before = await page.locator("#early-beta").boundingBox();
          const documentHeight = await page.evaluate(() => document.documentElement.scrollHeight);
          const scrollBefore = await page.evaluate(() => scrollY);
          const submit = page.locator('#early-beta button[type="submit"]');
          const box = (await submit.boundingBox())!;
          // Use a pointer click so Playwright cannot reposition the viewport.
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          const success = page.getByRole("heading", { name: rtl ? arabicHeadline : headline, exact: true });
          await expect(success).toBeFocused();
          await expect(success).toBeInViewport({ ratio: 1 });
          const confirmation = page.locator("[data-beta-success]");
          await confirmation.evaluate(async (el) => {
            await Promise.all(el.getAnimations().map((animation) => animation.finished));
          });
          await waitForScrollEnd(page);
          await expect(confirmation).toBeInViewport({ ratio: 1 });
          expect(scrollBefore - await page.evaluate(() => scrollY)).toBeGreaterThan(30);
          expect(Math.abs((await page.locator("#early-beta").boundingBox())!.height - before!.height)).toBeLessThanOrEqual(1);
          expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(documentHeight);
          await expect(page.locator("#early-beta form")).toHaveAttribute("inert", "");
          await expect(page.locator("#early-beta fieldset")).toHaveJSProperty("disabled", true);
          for (const id of ["first-name", "email", "country", "job-search-status", "preferred-language", "consent"]) {
            await expect(page.locator(`#early-user-${id}`)).toBeDisabled();
          }
          if (reducedMotion === "reduce") {
            expect(await confirmation.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
          }
          await page.keyboard.press("Tab");
          await expect(confirmation.locator('a[href="#features"]')).toBeFocused();
        });
      }
    }

    test("switches locale with accessible navigation and the original uncropped fox", async ({ page }) => {
      await page.goto("/");
      const launcher = page.locator(".career-assistant-trigger");
      const fox = launcher.locator("img[data-nori-mascot=static-fox]");
      await expect(fox).toBeVisible();
      await expect.poll(() => fox.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);
      expect(await fox.evaluate((el) => ({ fit: getComputedStyle(el).objectFit, animation: getComputedStyle(el.parentElement!).animationName }))).toEqual({ fit: "contain", animation: "nori-head-shake" });
      await launcher.click();
      await expect(page.locator(".career-chat-panel img[data-nori-mascot=static-fox]")).toBeVisible();
      await page.getByRole("button", { name: "Close career assistant", exact: true }).click();
      if ((page.viewportSize()?.width || 0) < 1280) await page.locator('header button[aria-expanded]').click();
      const rtl = locale.startsWith("ar");
      await page.getByRole("button", { name: rtl ? /^(EN|English)$/ : "العربية", exact: true }).click();
      await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "ltr" : "rtl");
      await expect(page.locator('header a[href="#early-beta"]')).toHaveText(rtl ? "Join Free Beta" : "انضم للبيتا مجانًا");
      await page.locator('header a[href="#early-beta"]').click();
      await expect(page.locator("#early-user-first-name")).toBeVisible();
      if ((page.viewportSize()?.width || 0) < 640) await expect(launcher).toBeHidden();
    });
  });
}

test("shakes only the fox artwork and stops for reduced motion", async ({ page }) => {
  await page.goto("/");
  await page.locator(".career-assistant-trigger").click();
  const panel = page.locator(".career-chat-panel");
  await expect(panel).toBeVisible();
  // The existing panel entrance is independent of the image-only head shake.
  await panel.evaluate(async (el) => { await Promise.all(el.getAnimations().map((animation) => animation.finished)); });
  const stationary = () => page.locator(".career-assistant-trigger, .career-chat-panel, .career-assistant-anchor").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  const before = await stationary();
  const angles: number[] = [];
  for (const progress of [0, 0.88, 0.90, 0.92, 0.94, 0.96, 0.98, 1]) {
    const rotations = await page.locator(".nori-mascot-head-shake").evaluateAll((els, phase) => els.map((el) => {
      const animation = el.getAnimations()[0];
      if (!animation?.effect) throw new Error("Missing fox head-shake animation");
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) * phase;
      const matrix = new DOMMatrixReadOnly(getComputedStyle(el).transform);
      return {
        angle: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
        scaleX: Math.hypot(matrix.a, matrix.b),
        scaleY: Math.hypot(matrix.c, matrix.d),
        determinant: matrix.a * matrix.d - matrix.b * matrix.c,
      };
    }), progress);
    for (const rotation of rotations) {
      angles.push(rotation.angle);
      expect(rotation.scaleX).toBeCloseTo(1, 5);
      expect(rotation.scaleY).toBeCloseTo(1, 5);
      expect(rotation.determinant).toBeCloseTo(1, 5);
      expect(Math.abs(rotation.angle)).toBeLessThanOrEqual(3.01);
    }
    expect(await stationary()).toEqual(before);
  }
  expect(Math.min(...angles)).toBeCloseTo(-3, 1);
  expect(Math.max(...angles)).toBeCloseTo(3, 1);
  await page.emulateMedia({ reducedMotion: "reduce" });
  const still = await page.locator(".nori-mascot-head-shake").evaluateAll((els) => els.map((el) => ({ animation: getComputedStyle(el).animationName, transform: getComputedStyle(el).transform })));
  expect(still).toEqual([{ animation: "none", transform: "none" }, { animation: "none", transform: "none" }]);
});

test("blinks both eyes together without moving the widget and respects reduced motion", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|hydrated|server rendered|did not match/i.test(message.text())) errors.push(message.text());
  });
  await page.goto("/");
  await page.locator(".career-assistant-trigger").click();
  await page.locator(".career-chat-panel").evaluate(async (el) => {
    await Promise.all(el.getAnimations().map((animation) => animation.finished));
  });
  await page.locator(".nori-mascot-head-shake").evaluateAll((els) => els.forEach((el) => {
    const animation = el.getAnimations()[0];
    animation.pause();
    animation.currentTime = 0;
  }));
  const stationary = () => page.locator(".career-assistant-trigger, .career-chat-panel, img[data-nori-mascot]").evaluateAll((els) => els.map((el) => el.getBoundingClientRect().toJSON()));
  const before = await stationary();
  const eyelids = page.locator(".nori-mascot-eyelid");
  await expect(eyelids).toHaveCount(4);
  for (const phase of [0, 0.94, 0.952, 0.956, 0.972, 1]) {
    const clips = await eyelids.evaluateAll((els, progress) => els.map((el) => {
      const animation = el.getAnimations()[0];
      if (!animation?.effect) throw new Error("Missing eyelid animation");
      animation.pause();
      animation.currentTime = Number(animation.effect.getTiming().duration) * progress;
      return getComputedStyle(el).clipPath;
    }), phase);
    expect(new Set(clips).size).toBe(1);
    expect(clips[0].includes("100%")).toBe(phase !== 0.952 && phase !== 0.956);
    expect(await stationary()).toEqual(before);
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  const reduced = await eyelids.evaluateAll((els) => els.map((el) => ({ animation: getComputedStyle(el).animationName, clip: getComputedStyle(el).clipPath })));
  expect(reduced.every((value) => value.animation === "none" && value.clip.includes("100%"))).toBe(true);
  const lines = await page.locator(".nori-mascot-closed-eyes").evaluateAll((els) => els.map((el) => getComputedStyle(el).opacity));
  expect(lines).toEqual(["0", "0"]);
  expect(errors).toEqual([]);
});

for (const failure of ["http", "network"] as const) {
  test(`${failure} failure retains values, supports retry and never claims success`, async ({ page }) => {
    await page.route("**/api/early-users", (route) => failure === "http" ? route.fulfill({ status: 503, json: { ok: false } }) : route.abort());
    await page.goto("/#early-beta");
    await fillForm(page);
    await page.locator('#early-beta button[type="submit"]').click();
    await expect(page.locator("#early-beta [role=alert]")).toBeVisible();
    await expect(page.locator("[data-beta-success]")).toHaveCount(0);
    await expect(page.locator("#early-user-email")).toHaveValue("beta-ui@example.test");
    await expect(page.locator('#early-beta button[type="submit"]')).toBeEnabled();
    await page.route("**/api/early-users", (route) => route.fulfill({ status: 200, json: { ok: true } }));
    await page.locator('#early-beta button[type="submit"]').click();
    await expect(page.getByRole("heading", { name: headline, exact: true })).toBeFocused();
  });
}

test("pending request locks the form and reduced motion disables the success transition", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  let finish!: () => void;
  let started!: () => void;
  const waiting = new Promise<void>((resolve) => { finish = resolve; });
  const requestStarted = new Promise<void>((resolve) => { started = resolve; });
  let requests = 0;
  await page.route("**/api/early-users", async (route) => {
    requests += 1;
    started();
    await waiting;
    await route.fulfill({ status: 200, json: { ok: true } });
  });
  try {
    await page.goto("/#early-beta");
    await fillForm(page);
    await page.locator('#early-beta button[type="submit"]').click();
    await requestStarted;
    await expect(page.locator("#early-beta form")).toHaveAttribute("aria-busy", "true");
    await expect(page.locator("#early-user-email")).toBeDisabled();
    await expect(page.locator("#early-beta [role=status]")).toHaveText("Joining the list…");
    expect(requests).toBe(1);
  } finally {
    finish();
  }
  const success = page.locator("[data-beta-success]");
  await expect(success).toBeVisible();
  expect(await success.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  expect(await page.locator("html").evaluate((el) => getComputedStyle(el).scrollBehavior)).toBe("auto");
});

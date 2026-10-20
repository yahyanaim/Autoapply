import { expect, type Locator, type Page, test } from "@playwright/test";

const trackSelector = ".feature-marquee-track, .company-logo-row";
const localeStorageKey = "applyai-landing-locale";

async function openLanding(page: Page, rtl: boolean) {
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
  await expect(page.locator("html")).toHaveAttribute("lang", rtl ? "ar" : "en");
  await expect(page.locator(trackSelector)).toHaveCount(3);
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

function collectHydrationErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (/hydration|hydrated|server rendered|did not match/i.test(message.text())) {
      errors.push(message.text());
    }
  });
  return errors;
}

async function sampleTrack(track: Locator, phase: number) {
  return track.evaluate((element, progress) => {
    const animation = element.getAnimations()[0];
    if (!animation?.effect) throw new Error("Expected a running marquee animation");
    animation.pause();
    animation.currentTime = Number(animation.effect.getTiming().duration) * progress;

    const isFeature = element.classList.contains("feature-marquee-track");
    const container = element.closest(isFeature ? ".feature-marquee" : ".company-logo-marquee")!;
    const bounds = container.getBoundingClientRect();
    const items = Array.from(element.querySelectorAll<HTMLElement>(
      isFeature ? ":scope > article" : ":scope > .company-logo-group > div",
    ));
    const boxes = items.map((item) => {
      const rect = item.getBoundingClientRect();
      return {
        key: item.querySelector("img")?.getAttribute("src"),
        left: rect.left - bounds.left,
        right: rect.right - bounds.left,
        width: rect.width,
        height: rect.height,
      };
    });
    const style = getComputedStyle(element);
    const matrix = new DOMMatrixReadOnly(style.transform);
    return {
      x: matrix.m41,
      width: bounds.width,
      gap: parseFloat(style.columnGap),
      period: Math.abs(boxes[items.length / 2].left - boxes[0].left),
      order: Math.sign(boxes[1].left - boxes[0].left),
      boxes,
      overflow: getComputedStyle(container).overflowX,
      viewportWidth: document.documentElement.clientWidth,
      documentWidth: document.documentElement.scrollWidth,
    };
  }, phase);
}

type TrackSample = Awaited<ReturnType<typeof sampleTrack>>;

function expectCoverage(sample: TrackSample) {
  // Ignore the transparent edge masks; normal inter-card gaps must remain intact.
  const start = sample.width * 0.08;
  const end = sample.width * 0.92;
  const visible = sample.boxes
    .filter((box) => box.right > start && box.left < end)
    .sort((a, b) => a.left - b.left);
  expect(visible.length, "Marquee should have visible content throughout its cycle").toBeGreaterThan(0);
  let coveredThrough = start;
  for (const box of visible) {
    expect(Math.max(0, box.left - coveredThrough), "Unexpected empty span in marquee").toBeLessThanOrEqual(sample.gap + 1);
    coveredThrough = Math.max(coveredThrough, box.right);
  }
  expect(Math.max(0, end - coveredThrough), "Unexpected empty trailing span").toBeLessThanOrEqual(sample.gap + 1);
  expect(sample.overflow).toBe("hidden");
  expect(sample.documentWidth).toBeLessThanOrEqual(sample.viewportWidth + 1);
}

function expectMatchingSeam(start: TrackSample, finish: TrackSample) {
  const visible = (sample: TrackSample) => sample.boxes.filter(
    (box) => Math.min(box.right, sample.width) - Math.max(box.left, 0) > 2,
  );
  const initial = visible(start);
  const final = visible(finish);
  expect(final).toHaveLength(initial.length);
  for (const box of initial) {
    const corresponding = final.find((other) => other.key === box.key);
    expect(corresponding, "Matching content should occupy the same position at the loop boundary").toBeDefined();
    expect(Math.abs(corresponding!.left - box.left)).toBeLessThan(0.1);
  }
}

async function expectMarquees(page: Page, rtl: boolean) {
  const tracks = page.locator(trackSelector);
  for (let index = 0; index < 3; index += 1) {
    const track = tracks.nth(index);
    const start = await sampleTrack(track, 0);
    const finish = await sampleTrack(track, 0.999999);
    const expectedSign = (rtl ? 1 : -1) * (index === 2 ? -1 : 1);
    expect(Math.sign(finish.x - start.x), "Motion must follow the locale and alternate logo rows").toBe(expectedSign);
    expect(Math.abs(Math.abs(finish.x - start.x) - start.period), "Travel must equal exactly one duplicated content period").toBeLessThan(0.1);
    expect(start.order, "Card order must follow the locale reading direction").toBe(rtl ? -1 : 1);

    const half = start.boxes.length / 2;
    for (let item = 0; item < half; item += 1) {
      expect(start.boxes[item].key).toBe(start.boxes[item + half].key);
      expect(start.boxes[item].width).toBe(start.boxes[item + half].width);
      expect(start.boxes[item].height).toBe(start.boxes[item + half].height);
      expect(Math.abs(start.boxes[item + half].left - start.boxes[item].left)).toBeCloseTo(start.period, 3);
    }

    expectMatchingSeam(start, finish);
    for (const phase of [0, 0.25, 0.5, 0.75, 0.999999, 1.000001]) {
      expectCoverage(await sampleTrack(track, phase));
    }
  }
}

async function expectContentAndAccessibility(page: Page, rtl: boolean) {
  const features = page.locator(".feature-marquee-track > article");
  const half = (await features.count()) / 2;
  expect(half).toBeGreaterThan(0);
  for (let index = 0; index < half; index += 1) {
    const original = features.nth(index);
    const duplicate = features.nth(index + half);
    await expect(original).toHaveAttribute("aria-hidden", "false");
    await expect(duplicate).toHaveAttribute("aria-hidden", "true");
    await expect(duplicate.locator("img")).toHaveAttribute("alt", "");
    expect(await original.locator("img").getAttribute("alt")).toBeTruthy();
    expect(await duplicate.locator("h3").textContent()).toBe(await original.locator("h3").textContent());
    const text = await original.locator("h3").evaluate((heading) => ({
      direction: getComputedStyle(heading).direction,
      alignment: getComputedStyle(heading).textAlign,
      value: heading.textContent,
    }));
    expect(text.direction).toBe(rtl ? "rtl" : "ltr");
    expect(["start", rtl ? "right" : "left"]).toContain(text.alignment);
    expect(/[\u0600-\u06ff]/.test(text.value || "")).toBe(rtl);
  }

  const rows = page.locator(".company-logo-row");
  for (let index = 0; index < 2; index += 1) {
    const groups = rows.nth(index).locator(".company-logo-group");
    await expect(groups.nth(0)).toHaveAttribute("aria-hidden", "false");
    await expect(groups.nth(1)).toHaveAttribute("aria-hidden", "true");
    expect(await groups.nth(0).locator("[title]").evaluateAll((items) => items.map((item) => item.getAttribute("title"))))
      .toEqual(await groups.nth(1).locator("[title]").evaluateAll((items) => items.map((item) => item.getAttribute("title"))));
    for (const image of await groups.nth(0).locator("img").all()) {
      expect(await image.getAttribute("alt")).toMatch(/\S+ logo$/);
    }
    for (const image of await groups.nth(1).locator("img").all()) {
      await expect(image).toHaveAttribute("alt", "");
    }
  }
  const label = await page.locator(".company-logo-marquee").getAttribute("aria-label");
  expect(label).toBeTruthy();
  expect(/[\u0600-\u06ff]/.test(label || "")).toBe(rtl);
}

for (const { locale, rtl, label } of [
  { locale: "en-US", rtl: false, label: "English" },
  { locale: "ar-MA", rtl: true, label: "Arabic" },
]) {
  test.describe(label, () => {
    test.use({ locale });
    test("keeps ordered, accessible content and seamless animation without overflow", async ({ page }) => {
      const hydrationErrors = collectHydrationErrors(page);
      await openLanding(page, rtl);
      await expectContentAndAccessibility(page, rtl);
      if (locale === "en-US" && await page.evaluate(() => matchMedia("(hover: hover)").matches)) {
        const track = page.locator(".feature-marquee-track");
        await page.locator(".feature-marquee").hover();
        await expect(track).toHaveCSS("animation-play-state", "paused");
        const pausedAt = await track.evaluate((element) => Number(element.getAnimations()[0].currentTime));
        await page.waitForTimeout(80);
        expect(await track.evaluate((element) => Number(element.getAnimations()[0].currentTime))).toBeCloseTo(pausedAt, 1);
        await page.mouse.move(0, 0);
        await expect(track).toHaveCSS("animation-play-state", "running");
        await expect.poll(() => track.evaluate((element) => Number(element.getAnimations()[0].currentTime))).toBeGreaterThan(pausedAt + 1);
      }
      await expectMarquees(page, rtl);
      expect(hydrationErrors).toEqual([]);
    });
  });
}

test("switches EN → AR → EN and restores the persisted locale without hydration errors", async ({ page }) => {
  const hydrationErrors = collectHydrationErrors(page);
  await openLanding(page, false);
  for (const rtl of [true, false]) {
    if ((page.viewportSize()?.width || 0) < 640) {
      await page.locator("header nav button[aria-expanded]").click();
    }
    await page.getByRole("button", { name: rtl ? "العربية" : /^(EN|English)$/, exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
    expect(await page.evaluate((key) => localStorage.getItem(key), localeStorageKey)).toBe(rtl ? "ar" : "en");
    await expectContentAndAccessibility(page, rtl);
    await expectMarquees(page, rtl);
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("dir", rtl ? "rtl" : "ltr");
    await expect(page.locator("html")).toHaveAttribute("lang", rtl ? "ar" : "en");
    await expectMarquees(page, rtl);
  }
  expect(hydrationErrors).toEqual([]);
});

for (const rtl of [false, true]) {
  test.describe(`reduced motion ${rtl ? "Arabic" : "English"}`, () => {
    test.use({
      locale: rtl ? "ar-MA" : "en-US",
      contextOptions: { reducedMotion: "reduce" },
    });
    test("keeps the original content visible and stops marquee animations", async ({ page }) => {
      await openLanding(page, rtl);
      expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
      await expectContentAndAccessibility(page, rtl);
      const states = await page.locator(trackSelector).evaluateAll((tracks) => tracks.map((track) => {
        const firstItem = track.querySelector("article, .company-logo-group > div")!;
        const rect = firstItem.getBoundingClientRect();
        const container = track.parentElement!.getBoundingClientRect();
        return {
          name: getComputedStyle(track).animationName,
          animations: track.getAnimations().length,
          visible: Math.min(rect.right, container.right) - Math.max(rect.left, container.left),
          x: new DOMMatrixReadOnly(getComputedStyle(track).transform).m41,
        };
      }));
      for (const state of states) {
        expect(state.name).toBe("none");
        expect(state.animations).toBe(0);
        expect(state.visible).toBeGreaterThan(0);
        expect(state.x).toBe(0);
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    });
  });
}

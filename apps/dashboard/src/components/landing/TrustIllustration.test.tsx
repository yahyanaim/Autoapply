import { afterEach, describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderView, type RenderedView } from "@/test/render";
import { TrustIllustration } from "./TrustIllustration";

let view: RenderedView | undefined;
afterEach(() => { view?.cleanup(); view = undefined; });

describe("landing trust illustrations", () => {
  it.each([
    [0, "human-approved"],
    [1, "truthful-by-design"],
    [2, "encrypted-storage"],
    [3, "official-sources"],
  ])("maps trust message %s to its supplied artwork", (variant, name) => {
    view = renderView(<TrustIllustration variant={Number(variant)} />);
    const { container } = view;
    const image = container.querySelector("img")!;

    expect(image.getAttribute("src")).toContain(encodeURIComponent(`/images/trust/${name}.webp`));
    expect(existsSync(resolve(process.cwd(), `public/images/trust/${name}.webp`))).toBe(true);
    expect(image.getAttribute("width")).toBe("64");
    expect(image.getAttribute("height")).toBe("48");
    expect(image.getAttribute("sizes")).toBe("64px");
    expect(image.getAttribute("alt")).toBe("");
    expect(image.className).toContain("object-contain");
    expect(image.parentElement?.className).toContain("h-12 w-16 shrink-0");
    expect(image.parentElement?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector("svg")).toBeNull();
  });
});

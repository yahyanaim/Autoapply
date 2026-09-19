"use client";

import Link from "next/link";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/Button";
import { LANDING_FAQ_ITEMS } from "./faq-data";

export function FaqSection() {
  return (
    <section
      id="faq"
      aria-labelledby="faq-heading"
      className="bg-white py-16 sm:py-24"
    >
      <div className="section-shell">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.14em] text-primary-600">
            Clear answers, before you begin
          </p>
          <h2
            id="faq-heading"
            className="mt-4 text-4xl font-medium leading-[1.02] tracking-[-0.045em] sm:text-5xl"
          >
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-sm leading-6 text-gray-600 sm:text-base">
            Apply with confidence, with the limits and controls explained clearly.
          </p>
        </div>

        <Accordion
          type="single"
          collapsible
          className="mx-auto mt-10 max-w-3xl rounded-2xl border border-black/[0.08] bg-[#faf9f7] px-5 sm:px-7"
        >
          {LANDING_FAQ_ITEMS.map((item) => (
            <AccordionItem key={item.id} value={item.id} className="last:border-b-0">
              <AccordionTrigger className="gap-6 text-start text-base font-semibold leading-6 text-gray-900 hover:text-primary-700 sm:text-lg">
                {item.question}
              </AccordionTrigger>
              <AccordionContent className="pe-8 text-start text-sm leading-6 text-gray-600 sm:text-base">
                {item.paragraphs.map((paragraph) => (
                  <p key={paragraph} className="mt-0 first:mt-0">
                    {paragraph}
                  </p>
                ))}
                {item.items && (
                  <ul className="mt-4 space-y-2 border-s-2 border-primary-200 ps-4">
                    {item.items.map((feature) => (
                      <li key={feature}>{feature}</li>
                    ))}
                  </ul>
                )}
                {item.id === "resume-privacy" && (
                  <Link
                    href="/privacy"
                    className="mt-4 inline-flex font-semibold text-primary-700 underline-offset-4 hover:underline"
                  >
                    Read the Privacy Notice
                  </Link>
                )}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>

        <div className="mt-9 flex justify-center">
          <Button asChild size="lg" className="rounded-xl px-7">
            <Link href="#early-beta">Join the ApplyAI Early Beta</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

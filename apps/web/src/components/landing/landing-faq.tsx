"use client";

import { landingFaqs } from "@/lib/landing-content";
import { Reveal, Stagger, StaggerItem } from "./landing-motion";

export function LandingFaq() {
  return (
    <section id="faq" className="border-b bg-muted/20 py-16 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <h2 className="display-tight text-3xl font-semibold tracking-tight sm:text-4xl">
            Frequently asked questions
          </h2>
        </Reveal>

        <Stagger className="mt-10 divide-y border-y">
          {landingFaqs.map((faq) => (
            <StaggerItem key={faq.question}>
              <details className="group py-4">
                <summary className="cursor-pointer list-none text-base font-medium marker:content-none [&::-webkit-details-marker]:hidden">
                  <span className="flex items-center justify-between gap-4">
                    {faq.question}
                    <span
                      aria-hidden
                      className="text-muted-foreground transition-transform group-open:rotate-45"
                    >
                      +
                    </span>
                  </span>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{faq.answer}</p>
              </details>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

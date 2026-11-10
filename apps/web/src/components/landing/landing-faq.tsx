"use client";

import { landingFaqs } from "@/lib/landing-content";
import { FaqItem } from "./faq-item";
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
              <FaqItem faq={faq} />
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}

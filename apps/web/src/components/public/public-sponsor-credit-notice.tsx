import Image from "next/image";
import { ArrowSquareOutIcon, MegaphoneIcon } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BRAND_CREDIT_DISCOUNTED_URL, brandCreditTiers } from "@/lib/brand-guidelines";

const discounted = brandCreditTiers.find((tier) => tier.id === "discounted")!;

/**
 * Shown on a quote whose "Discount Terms" are ticked: the host agrees to
 * credit Arbor Live as a sponsor when they approve. Links to /brand.
 */
export function PublicSponsorCreditNotice({ approved }: { approved: boolean }) {
  return (
    <Card className="ring-primary/40" data-testid="sponsor-credit-notice">
      <CardContent className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <div className="flex gap-3">
          <span className="flex size-8 shrink-0 items-center justify-center bg-primary/10 text-primary">
            <MegaphoneIcon aria-hidden className="size-4" weight="fill" />
          </span>
          <div className="min-w-0 space-y-2 text-sm">
            <p className="font-heading font-medium">
              {approved ? "Credit Arbor Live as your sponsor" : "This quote includes a discount"}
            </p>
            <p className="text-muted-foreground">
              {approved
                ? "Your discounted booking means every marketing post credits us. Use one of these lines and tag or link Arbor Live:"
                : "By approving it, you agree to credit Arbor Live in every marketing post, using one of these lines and tagging or linking us:"}
            </p>
            <ul className="space-y-1 font-medium">
              {discounted.phrases.map((phrase) => (
                <li key={phrase}>{phrase}</li>
              ))}
            </ul>
            <Button asChild size="sm" variant={approved ? "default" : "outline"} className="mt-1">
              <a href={BRAND_CREDIT_DISCOUNTED_URL} target="_blank" rel="noopener noreferrer">
                Badges and guidelines
                <ArrowSquareOutIcon data-icon="inline-end" />
              </a>
            </Button>
          </div>
        </div>
        <div className="hidden w-56 border bg-white p-3 sm:block">
          <Image
            src="/brand/badges/sponsored-by-black.png"
            alt="“Sponsored by Arbor Live” badge"
            width={4350}
            height={1246}
            sizes="224px"
            className="h-auto w-full"
          />
        </div>
      </CardContent>
    </Card>
  );
}

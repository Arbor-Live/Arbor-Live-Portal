import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FaqItem } from "@/components/landing/faq-item";
import { quoteFaqs } from "@/lib/quote-faq-content";

export function PublicQuoteFaq() {
  return (
    <Card data-testid="public-quote-faq">
      <CardHeader>
        <CardTitle>Questions about your quote</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="divide-y border-y">
          {quoteFaqs.map((faq) => (
            <FaqItem key={faq.question} faq={faq} />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

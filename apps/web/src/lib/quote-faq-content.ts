import { ARBOR_PAYMENT_DETAILS as pay } from "@arbor/invoice-document/payment-details";
import { whyWeChargeFaq, type LandingFaq } from "@/lib/landing-content";

/** Client quote page FAQ. Every answer restates what the portal already enforces. */
export const quoteFaqs: LandingFaq[] = [
  whyWeChargeFaq,
  {
    question: "When do I pay?",
    answer:
      "After your event. Your approved quote is an estimate: crew hours and anything added on the day are settled afterwards. Then we email you the final invoice and open payment on this page. Please don't send payment before then.",
  },
  {
    question: "How do I pay?",
    answer: [
      `Pay through ASSU ePay or a GrantEd Group Transfer to VSO ${pay.vsoName} (${pay.vsoNumber}), or send an iJournal to PTA ${pay.ijournalPta} (approver: ${pay.ijournalApprover}).`,
      "Once payment is sent, submit its reference number on this page. A PTA on its own isn't proof of payment. For an iJournal we need the iJournal number.",
    ].join("\n\n"),
  },
  {
    question: "What if I pay late?",
    answer:
      "Payment is due by the date on your invoice. After the first month past due, a $25 late fee is added each month.",
  },
  {
    question: "Can I change my quote?",
    answer:
      "Yes. Before you approve it, use Request Changes on this page and we'll send you an updated quote. After you approve it, email arborlive@stanford.edu.",
  },
];

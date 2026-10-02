/**
 * Equipment loan agreement shown on every borrow request (crew and artists).
 * Each term is its own checkbox; the requester must tick all of them and type
 * their name to e-sign. Submitted requests snapshot the version and the exact
 * term text, so bump `BORROW_AGREEMENT_VERSION` whenever the wording changes.
 */
export const BORROW_AGREEMENT_VERSION = "2026-10-01";

export type BorrowAgreementTerm = {
  key: string;
  title: string;
  text: string;
};

export const BORROW_AGREEMENT_TERMS: readonly BorrowAgreementTerm[] = [
  {
    key: "no_support",
    title: "No support",
    text: "This is an unsupported equipment loan. Arbor Live does not set up, operate, or troubleshoot borrowed equipment and cannot help solve issues while I have it.",
  },
  {
    key: "competency",
    title: "I know how to use it",
    text: "I, and anyone operating the equipment, know how to use it. It is professional-grade gear not designed for inexperienced users. Arbor Live is not responsible for event failures or damage caused by operator inexperience.",
  },
  {
    key: "condition",
    title: "Condition at pickup and return",
    text: "The equipment is tested and working before pickup. By taking it, I accept that it is in good working order, and I will return it in the same condition, clean and organized.",
  },
  {
    key: "full_liability",
    title: "I am fully liable",
    text: "I am 100% responsible for the equipment from the moment I pick it up until Arbor Live checks it back in.",
  },
  {
    key: "damage_costs",
    title: "I pay for damage",
    text: "I will pay all repair or replacement costs from damage, misuse, or environmental factors (for example liquid spills, power surges, or improper mounting), up to $10,000 per incident.",
  },
  {
    key: "third_party_loss_theft",
    title: "Third parties, loss, and theft",
    text: "I am responsible for damage caused by anyone else (attendees, other vendors, friends). If anything is lost or stolen, I will be invoiced the full replacement cost.",
  },
  {
    key: "inspection",
    title: "7-day inspection",
    text: "Arbor Live inspects the equipment within 7 days of return and may invoice me for damage found then, even if it was not apparent at drop-off.",
  },
  {
    key: "deadlines",
    title: "Pickup and return on time",
    text: "I will pick up and return at the agreed times. A late return costs $20 per missed window plus the full daily rental rate for each day late (rounded up). Late, damaged, or disorganized returns can cost me future borrowing.",
  },
  {
    key: "usage",
    title: "Agreed use only",
    text: "I will use the equipment only for the purpose and location in this request. No lending it to others, off-campus use, or hardware/software modification without written approval from Arbor Live.",
  },
];

export const BORROW_AGREEMENT_TERM_KEYS = BORROW_AGREEMENT_TERMS.map((term) => term.key);

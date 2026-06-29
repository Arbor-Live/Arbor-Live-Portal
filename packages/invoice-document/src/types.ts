export type InvoiceLineItemSection =
  | "equipment_package"
  | "equipment_type"
  | "external_rental"
  | "artist"
  | "crew"
  | "fee"
  | string;

export type InvoiceLineItem = {
  id: string;
  section: InvoiceLineItemSection;
  provider?: string;
  label: string;
  quantity: number;
  rateUsd: number;
  amountUsd: number;
};

export type InvoiceDocumentInvoice = {
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  managerName: string;
  managerEmail?: string;
  clientGroupName?: string;
  clientContactName?: string;
  clientEmail?: string;
  clientPhone?: string;
  clientApprovalStatus?: string;
  digitalQuoteUrl?: string;
  equipmentSubtotalUsd: number;
  externalRentalsSubtotalUsd: number;
  artistsSubtotalUsd: number;
  crewSubtotalUsd: number;
  feesSubtotalUsd: number;
  subtotalUsd: number;
  discountAmountUsd: number;
  totalUsd: number;
  notes?: string;
};

export type InvoiceDocumentData = {
  invoice: InvoiceDocumentInvoice;
  lineItems: InvoiceLineItem[];
};

export type GroupedInvoiceSections = {
  equipment: InvoiceLineItem[];
  external: InvoiceLineItem[];
  artists: InvoiceLineItem[];
  crew: InvoiceLineItem[];
  fees: InvoiceLineItem[];
};

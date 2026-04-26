"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/lib/convex-api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export function FinancialHubSettings() {
  const fees = useQuery(api.invoiceFeeDefinitions.list, {});
  const terms = useQuery(api.invoiceTerms.list, {});
  const createFee = useMutation(api.invoiceFeeDefinitions.create);
  const updateFee = useMutation(api.invoiceFeeDefinitions.update);
  const removeFee = useMutation(api.invoiceFeeDefinitions.remove);
  const createTerms = useMutation(api.invoiceTerms.create);
  const updateTerms = useMutation(api.invoiceTerms.update);
  const removeTerms = useMutation(api.invoiceTerms.remove);

  const [feeKey, setFeeKey] = useState("");
  const [feeLabel, setFeeLabel] = useState("");
  const [feeAmount, setFeeAmount] = useState("0");
  const [termsLabel, setTermsLabel] = useState("");
  const [termsVersion, setTermsVersion] = useState("v1");
  const [termsMarkdown, setTermsMarkdown] = useState("");

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Fee Definitions</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(fees ?? []).map((fee) => (
            <div key={fee._id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{fee.label}</p>
              <p className="text-xs text-muted-foreground">{fee.key}</p>
              <div className="mt-2 flex gap-2">
                <Input
                  value={(fee.defaultAmountUsd ?? 0).toString()}
                  onChange={(e) => {
                    void updateFee({
                      id: fee._id,
                      defaultAmountUsd: Number(e.target.value || "0"),
                    });
                  }}
                />
                <Button type="button" variant="outline" onClick={() => void updateFee({ id: fee._id, active: !fee.active })}>
                  {fee.active ? "Disable" : "Enable"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void removeFee({ id: fee._id })}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Add fee</p>
            <div className="grid gap-2">
              <Input placeholder="Key (e.g. labor_fee)" value={feeKey} onChange={(e) => setFeeKey(e.target.value)} />
              <Input placeholder="Label" value={feeLabel} onChange={(e) => setFeeLabel(e.target.value)} />
              <Input placeholder="Default amount" value={feeAmount} onChange={(e) => setFeeAmount(e.target.value)} />
              <Button
                type="button"
                onClick={async () => {
                  await createFee({
                    key: feeKey,
                    label: feeLabel,
                    defaultAmountUsd: Number(feeAmount || "0"),
                    active: true,
                  });
                  setFeeKey("");
                  setFeeLabel("");
                  setFeeAmount("0");
                }}
              >
                Add Fee
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Terms Templates</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {(terms ?? []).map((term) => (
            <div key={term._id} className="rounded-md border p-3 text-sm">
              <p className="font-medium">{term.label} ({term.version})</p>
              <textarea
                className="mt-2 min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                defaultValue={term.markdown}
                onBlur={(e) => {
                  void updateTerms({ id: term._id, markdown: e.target.value });
                }}
              />
              <div className="mt-2 flex gap-2">
                <Button type="button" variant="outline" onClick={() => void updateTerms({ id: term._id, active: !term.active })}>
                  {term.active ? "Disable" : "Enable"}
                </Button>
                <Button type="button" variant="outline" onClick={() => void removeTerms({ id: term._id })}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
          <div className="rounded-md border p-3">
            <p className="mb-2 text-sm font-medium">Add terms template</p>
            <div className="grid gap-2">
              <Label>Label</Label>
              <Input value={termsLabel} onChange={(e) => setTermsLabel(e.target.value)} />
              <Label>Version</Label>
              <Input value={termsVersion} onChange={(e) => setTermsVersion(e.target.value)} />
              <Label>Markdown</Label>
              <textarea
                className="min-h-20 w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={termsMarkdown}
                onChange={(e) => setTermsMarkdown(e.target.value)}
              />
              <Button
                type="button"
                onClick={async () => {
                  await createTerms({
                    label: termsLabel,
                    version: termsVersion,
                    markdown: termsMarkdown,
                    active: true,
                  });
                  setTermsLabel("");
                  setTermsVersion("v1");
                  setTermsMarkdown("");
                }}
              >
                Add Terms
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

import {
  BodyCopy,
  CtaButton,
  DataCard,
  DetailRow,
  EmailLayout,
  EmailSignOff,
} from "./_components/email-layout";
import type { CohoGiftCardLowBalanceEmailProps } from "../src/types";

export function CohoGiftCardLowBalanceEmail({
  balanceUsd,
  thresholdUsd,
  dashboardUrl,
}: CohoGiftCardLowBalanceEmailProps) {
  return (
    <EmailLayout
      preview={`CoHo gift card is down to $${balanceUsd.toFixed(2)}`}
      heading="CoHo gift card is running low"
    >
      <BodyCopy>
        The shared CoHo gift card that crew use for meals has dropped below the alert
        threshold. Top it up before the next event day.
      </BodyCopy>
      <DataCard title="Balance">
        <DetailRow label="Current balance" value={`$${balanceUsd.toFixed(2)}`} />
        <DetailRow label="Alert threshold" value={`$${thresholdUsd.toFixed(2)}`} />
      </DataCard>
      <CtaButton href={dashboardUrl} label="Open the portal" />
      <EmailSignOff />
    </EmailLayout>
  );
}

CohoGiftCardLowBalanceEmail.PreviewProps = {
  balanceUsd: 38.5,
  thresholdUsd: 50,
  dashboardUrl: "http://localhost:3000/dashboard",
} satisfies CohoGiftCardLowBalanceEmailProps;

export default CohoGiftCardLowBalanceEmail;

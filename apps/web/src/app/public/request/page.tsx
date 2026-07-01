import { BookingRequestWizard } from "@/components/request/booking-request-wizard";
import { PublicMarketingLayout } from "@/components/public/public-marketing-layout";
import { isAuthenticated } from "@/lib/auth-server";

export const metadata = {
  title: "Request booking | Arbor Live",
  description: "Submit a booking request for Arbor Live event production services.",
};

export default async function PublicRequestPage() {
  const authed = await isAuthenticated();

  return (
    <PublicMarketingLayout showDashboardLink={authed}>
      <BookingRequestWizard />
    </PublicMarketingLayout>
  );
}

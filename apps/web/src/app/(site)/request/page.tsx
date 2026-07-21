import { BookingRequestWizard } from "@/components/request/booking-request-wizard";

export const metadata = {
  title: "Request booking | Arbor Live",
  description: "Submit a booking request for Arbor Live event production services.",
};

export default function PublicRequestPage() {
  return <BookingRequestWizard />;
}

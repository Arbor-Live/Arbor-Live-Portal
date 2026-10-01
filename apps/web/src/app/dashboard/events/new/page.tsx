import { EventCreateForm } from "@/components/events/workspace/event-create-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create event",
};

export default function NewEventPage() {
  return <EventCreateForm />;
}

import { OpenMicWizard } from "@/components/request/open-mic-wizard";

export const metadata = {
  title: "Open Mic sign-up | Arbor Live",
  description: "Sign up to perform at the next Arbor Live open mic.",
};

export default function PublicOpenMicPage() {
  return <OpenMicWizard />;
}
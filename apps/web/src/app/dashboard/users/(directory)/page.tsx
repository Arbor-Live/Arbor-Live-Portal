import { Suspense } from "react";
import { PeopleTab } from "@/components/users/directory/people-tab";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "People",
};

export default function UsersPeoplePage() {
  return (
    <Suspense>
      <PeopleTab />
    </Suspense>
  );
}

import { Suspense } from "react";
import { PeopleTab } from "@/components/users/directory/people-tab";

export default function UsersPeoplePage() {
  return (
    <Suspense>
      <PeopleTab />
    </Suspense>
  );
}

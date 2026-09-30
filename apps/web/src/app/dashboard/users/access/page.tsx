import { redirect } from "next/navigation";

/** Access & Invites merged into the Users page's People tab. */
export default function UsersAccessPage() {
  redirect("/dashboard/users");
}

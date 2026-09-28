import { redirect } from "next/navigation";

export default function InventoryIndexPage() {
  redirect("/dashboard/inventory/items");
}

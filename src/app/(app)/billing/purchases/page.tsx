import { redirect } from "next/navigation";

// /billing/purchases is the Purchases tab; bills are its main list.
export default function Page() {
  redirect("/billing/purchase-bills");
}

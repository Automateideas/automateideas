import { route } from "@/lib/access";
import { requireBillingPermission } from "@/lib/business-billing/access";
import { customerCategories } from "@/lib/business-billing/customers";

// GET /api/business-billing/customers/categories: categories already in use (billing.view).
export const GET = route(async () => {
  const { organizationId } = await requireBillingPermission("billing.view");
  return Response.json({ categories: await customerCategories(organizationId) });
});

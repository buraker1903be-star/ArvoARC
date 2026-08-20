import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function requireTenant() {
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) redirect("/login");

  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations(id, name, slug, plan_code, status)")
    .eq("user_id", user.id)
    .eq("is_active", true);

  if (error) throw new Error(`Tenant could not be resolved: ${error.message}`);
  if (!memberships?.length) redirect("/login?error=no-organization");

  const preferred = memberships.find((membership) => {
    const organization = Array.isArray(membership.organizations)
      ? membership.organizations[0]
      : membership.organizations;
    return organization?.slug === "arvoculture";
  }) ?? memberships[0];

  const organization = Array.isArray(preferred.organizations)
    ? preferred.organizations[0]
    : preferred.organizations;

  if (!organization) throw new Error("Organization record is missing.");
  if (organization.status !== "active" && organization.status !== "trial") {
    redirect("/login?error=organization-inactive");
  }

  const { data: commerceModule, error: moduleError } = await supabase
    .from("organization_modules")
    .select("is_enabled")
    .eq("organization_id", organization.id)
    .eq("module_code", "commerce")
    .maybeSingle();

  if (moduleError) throw new Error(`Commerce access could not be resolved: ${moduleError.message}`);
  if (!commerceModule?.is_enabled) redirect("/login?error=commerce-disabled");

  return { supabase, user, membership: preferred, organization };
}

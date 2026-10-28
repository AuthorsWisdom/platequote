import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ADMIN_COOKIE, adminAuthorized } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const jar = await cookies();
  if (!(await adminAuthorized(jar.get(ADMIN_COOKIE)?.value))) {
    redirect("/login?next=/dashboard");
  }
  return children;
}

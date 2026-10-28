import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/login-form";
import { ADMIN_COOKIE, adminAuthorized, adminConfig, safeNextPath } from "@/lib/admin-session";

export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const params = await searchParams;
  const next = safeNextPath(params.next);
  const config = adminConfig();
  if (config.state === "ready") {
    const jar = await cookies();
    if (await adminAuthorized(jar.get(ADMIN_COOKIE)?.value)) redirect(next);
  }

  return (
    <div className="mx-auto max-w-md rounded-2xl border border-border bg-card p-6">
      <h1 className="font-heading text-3xl tracking-tight">Shop admin</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Orders, shop rates, and the ops notes are behind this password. Quotes and PayPal checkout stay public.
      </p>
      {config.state === "locked" ? <p className="mt-4 text-sm">{config.message}</p> : <LoginForm next={next} />}
    </div>
  );
}

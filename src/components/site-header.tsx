import Link from "next/link";
import { cookies } from "next/headers";
import { ADMIN_COOKIE, adminAuthorized } from "@/lib/admin-session";

const publicLinks = [
  { href: "/", label: "Quote" },
  { href: "/terms", label: "Terms" },
  { href: "/terms#privacy", label: "Privacy" },
  { href: "/login", label: "Shop admin" },
];

const adminLinks = [
  { href: "/", label: "Quote" },
  { href: "/dashboard", label: "Orders" },
  { href: "/dashboard/settings", label: "Shop setup" },
  { href: "/dashboard/ops", label: "Ops chat" },
];

export async function SiteHeader() {
  const jar = await cookies();
  const admin = await adminAuthorized(jar.get(ADMIN_COOKIE)?.value);
  const links = admin ? adminLinks : publicLinks;

  return (
    <header className="border-b border-border bg-card/80">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="group flex items-baseline gap-2">
          <span className="font-heading text-xl tracking-tight text-foreground">PlateQuote</span>
          <span className="text-xs text-muted-foreground">slicer price, then PayPal</span>
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="rounded-lg px-2.5 py-1.5 text-foreground/80 hover:bg-muted hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
          {admin ? (
            <form action="/api/admin/logout" method="post">
              <button
                type="submit"
                className="rounded-lg px-2.5 py-1.5 text-foreground/80 hover:bg-muted hover:text-foreground"
              >
                Log out
              </button>
            </form>
          ) : null}
        </nav>
      </div>
    </header>
  );
}

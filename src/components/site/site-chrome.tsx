"use client";

import { usePathname } from "next/navigation";

// Pathname guard so the public header/footer never wrap the staff or auth
// shells: /admin keeps its own sidebar/topbar layout, /(auth) and member
// /dashboard pages keep theirs. Server components (header/footer) are passed
// in as children from the root layout (composition pattern).
const CHROMELESS_PREFIXES = [
  "/admin",
  "/dashboard",
  "/login",
  "/register",
  "/verify-email",
  "/forgot-password",
  "/reset-password",
  "/accept-invite",
];

export function SiteChrome({
  header,
  footer,
  children,
}: {
  header: React.ReactNode;
  footer: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname() ?? "";
  const bare = CHROMELESS_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (bare) return <>{children}</>;
  return (
    <>
      {header}
      <div className="min-h-[60vh]">{children}</div>
      {footer}
    </>
  );
}

export default SiteChrome;

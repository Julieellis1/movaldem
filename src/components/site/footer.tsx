import Link from "next/link";
import { db } from "@/db/client";
import { getSetting } from "@/modules/platform/settings/settings.service";

// PRD 04 §3 section 10 footer info. Async server component: reads church
// contact/social settings (each optional — hidden when unset) so the CMS can
// edit contact information without code changes (05 §13).
async function getFooterInfo() {
  const [name, address, phone, email, facebook, x, instagram, youtube] = await Promise.all([
    getSetting<string>(db, "church.name", "Mountain of Victory at the Last Day Evangelical Ministry"),
    getSetting<string>(db, "church.address"),
    getSetting<string>(db, "church.phone"),
    getSetting<string>(db, "church.email"),
    getSetting<string>(db, "church.facebook"),
    getSetting<string>(db, "church.twitter"),
    getSetting<string>(db, "church.instagram"),
    getSetting<string>(db, "church.youtube"),
  ]);
  return { name, address, phone, email, facebook, x, instagram, youtube };
}

const QUICK_LINKS: Array<{ href: string; label: string }> = [
  { href: "/about", label: "About" },
  { href: "/sermons", label: "Sermons" },
  { href: "/bible-study", label: "Bible Study" },
  { href: "/sunday-school", label: "Sunday School" },
  { href: "/events", label: "Events" },
  { href: "/programmes", label: "Programmes" },
  { href: "/gallery", label: "Gallery" },
  { href: "/contact", label: "Contact" },
];

export async function Footer() {
  const info = await getFooterInfo();
  const socials = [
    { href: info.facebook, label: "Facebook" },
    { href: info.x, label: "X" },
    { href: info.instagram, label: "Instagram" },
    { href: info.youtube, label: "YouTube" },
  ].filter((s): s is { href: string; label: string } => Boolean(s.href));
  const year = new Date().getFullYear();
  return (
    <footer className="border-t border-border-subtle bg-surface-elevated">
      <div className="mx-auto grid w-full max-w-6xl grid-cols-1 gap-8 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-3">
        <div>
          <p className="font-headline-sm text-headline-sm text-text-primary">MOVALDEM</p>
          {info.name && <p className="mt-1 text-sm text-on-surface-variant">{info.name}</p>}
          {info.address && <p className="mt-3 text-sm text-on-surface-variant">{info.address}</p>}
          {info.phone && (
            <p className="mt-1 text-sm text-on-surface-variant">
              <a href={`tel:${info.phone}`} className="hover:underline">
                {info.phone}
              </a>
            </p>
          )}
          {info.email && (
            <p className="mt-1 text-sm text-on-surface-variant">
              <a href={`mailto:${info.email}`} className="hover:underline">
                {info.email}
              </a>
            </p>
          )}
          {socials.length > 0 && (
            <ul aria-label="Social links" className="mt-3 flex flex-wrap gap-3 text-sm">
              {socials.map((s) => (
                <li key={s.label}>
                  <a href={s.href} target="_blank" rel="noopener noreferrer" className="hover:underline">
                    {s.label}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
        <nav aria-label="Footer">
          <p className="text-sm font-semibold text-text-primary">Quick links</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-sm text-on-surface-variant">
            {QUICK_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="hover:underline">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div>
          <p className="text-sm font-semibold text-text-primary">Visit us</p>
          <p className="mt-3 text-sm text-on-surface-variant">
            Join us for worship, Bible study and Sunday school.
          </p>
          <p className="mt-3 text-sm text-on-surface-variant">
            <Link href="/contact" className="hover:underline">
              Contact us
            </Link>
            {" · "}
            <Link href="/branches" className="hover:underline">
              Our branches
            </Link>
          </p>
        </div>
      </div>
      <div className="border-t border-border-subtle">
        <p className="mx-auto w-full max-w-6xl px-4 py-4 text-xs text-on-surface-variant sm:px-6">
          © {year} {info.name ?? "MOVALDEM"}. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

export default Footer;

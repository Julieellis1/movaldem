import type { Metadata } from "next";
import { db } from "@/db/client";
import { getSetting } from "@/modules/platform/settings/settings.service";
import { ContactForm } from "@/components/content/contact-form";
import { canonicalUrl } from "@/modules/content/spotlight";

// PRD 04 §9: ContactForm posts to /api/contact (built by a parallel worker;
// uses the form's default action). Church address/phone/email/social from
// Settings; map embed only when the contact.map_url setting exists.
export const metadata: Metadata = {
  title: "Contact Us | MOVALDEM",
  description: "Get in touch with MOVALDEM: send us a message, find our address, phone and email.",
  alternates: { canonical: canonicalUrl("/contact") },
};

async function getContactInfo() {
  const [name, address, phone, email, mapUrl, facebook, x, instagram, youtube] = await Promise.all([
    getSetting<string>(db, "church.name", "Mountain of Victory at the Last Day Evangelical Ministry"),
    getSetting<string>(db, "church.address"),
    getSetting<string>(db, "church.phone"),
    getSetting<string>(db, "church.email"),
    getSetting<string>(db, "contact.map_url"),
    getSetting<string>(db, "church.facebook"),
    getSetting<string>(db, "church.twitter"),
    getSetting<string>(db, "church.instagram"),
    getSetting<string>(db, "church.youtube"),
  ]);
  return { name, address, phone, email, mapUrl, facebook, x, instagram, youtube };
}

export default async function ContactPage() {
  const info = await getContactInfo();
  const socials = [
    { href: info.facebook, label: "Facebook" },
    { href: info.x, label: "X" },
    { href: info.instagram, label: "Instagram" },
    { href: info.youtube, label: "YouTube" },
  ].filter((s): s is { href: string; label: string } => Boolean(s.href));
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <header className="mb-6 max-w-2xl">
        <h1 className="font-headline-lg text-headline-lg text-text-primary">Contact Us</h1>
        <p className="mt-2 font-body-md text-body-md text-on-surface-variant">
          Send us a message — we will get back to you shortly.
        </p>
      </header>
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        <section aria-label="Send a message">
          <ContactForm />
        </section>
        <section aria-label="Church contact information" className="flex flex-col gap-4">
          <div className="rounded-xl border border-border-subtle bg-surface-card p-6">
            {info.name && (
              <h2 className="font-headline-sm text-headline-sm text-text-primary">{info.name}</h2>
            )}
            <dl className="mt-3 flex flex-col gap-2 text-sm text-on-surface-variant">
              {info.address && (
                <div>
                  <dt className="font-medium text-text-primary">Address</dt>
                  <dd>{info.address}</dd>
                </div>
              )}
              {info.phone && (
                <div>
                  <dt className="font-medium text-text-primary">Phone</dt>
                  <dd>
                    <a href={`tel:${info.phone}`} className="hover:underline">
                      {info.phone}
                    </a>
                  </dd>
                </div>
              )}
              {info.email && (
                <div>
                  <dt className="font-medium text-text-primary">Email</dt>
                  <dd>
                    <a href={`mailto:${info.email}`} className="hover:underline">
                      {info.email}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
            {socials.length > 0 && (
              <ul aria-label="Social links" className="mt-4 flex flex-wrap gap-3 text-sm">
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
          {info.mapUrl && (
            <div className="overflow-hidden rounded-xl border border-border-subtle">
              <iframe
                title="Church location map"
                src={info.mapUrl}
                loading="lazy"
                className="h-72 w-full border-0"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

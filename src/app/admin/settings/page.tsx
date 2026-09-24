import { getCurrentSession } from "@/lib/server-session";
import { requirePermission } from "@/modules/auth/rbac.service";
import { db } from "@/db/client";
import { getSetting, maskSetting } from "@/modules/platform/settings/settings.service";
import { SETTINGS_FIELDS, SETTINGS_TABS } from "@/modules/platform/settings/settings.fields";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Server-owned permission gate (PERM-01); middleware is only the fast path.
// The form posts natively to the save API, which writes and redirects back,
// so a save either fully lands before the page re-renders or never lands.
export default async function AdminSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { permissions } = await getCurrentSession();
  requirePermission(permissions, "settings.read");
  const { saved, error } = await searchParams;

  // Secrets never reach the client: maskSetting returns "" when unset or a
  // masked placeholder otherwise (SEC-11).
  const values: Record<string, string> = {};
  for (const field of SETTINGS_FIELDS) {
    if (field.isSecret) {
      values[field.key] = await maskSetting(db, field.key);
    } else {
      const raw = await getSetting(db, field.key, "");
      values[field.key] = raw === null || raw === undefined ? "" : String(raw);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-text-primary">Settings</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Secret values are masked and write-only — leave a field blank to keep it. Every save is
          recorded in the audit log (SEC-11).
        </p>
      </div>
      {saved && (
        <p
          role="status"
          className="rounded-full bg-primary/10 px-4 py-2 text-sm font-medium text-primary"
        >
          Saved
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="rounded-full bg-destructive/10 px-4 py-2 text-sm text-destructive"
        >
          {error}
        </p>
      )}
      <nav
        aria-label="Settings sections"
        className="flex flex-wrap gap-1.5 rounded-full bg-surface-card p-1.5"
      >
        {SETTINGS_TABS.map((tab) => (
          <a
            key={tab}
            href={`#${tab.toLowerCase()}`}
            className="rounded-full px-4 py-1.5 text-sm text-text-secondary transition-colors hover:bg-surface-elevated hover:text-text-primary"
          >
            {tab}
          </a>
        ))}
      </nav>
      <form action="/api/admin/settings" method="POST" className="space-y-6">
        {SETTINGS_TABS.map((tab) => {
          const tabFields = SETTINGS_FIELDS.filter((f) => f.tab === tab);
          return (
            <section
              key={tab}
              id={tab.toLowerCase()}
              className="space-y-4 rounded-xl bg-surface-card p-5 scroll-mt-6"
            >
              <h2 className="font-headline-sm text-headline-sm text-text-primary">{tab}</h2>
              {tabFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key}>{field.label}</Label>
                  {field.description && (
                    <p className="text-xs text-text-tertiary">{field.description}</p>
                  )}
                  {field.type === "boolean" ? (
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        id={field.key}
                        name={field.key}
                        type="checkbox"
                        defaultChecked={values[field.key] === "true"}
                        className="h-4 w-4 rounded border-input accent-primary"
                      />
                      <span className="text-sm text-on-surface-variant">Enabled</span>
                    </div>
                  ) : (
                    <Input
                      id={field.key}
                      name={field.key}
                      type={
                        field.type === "password"
                          ? "password"
                          : field.type === "number"
                            ? "number"
                            : "text"
                      }
                      defaultValue={values[field.key]}
                      autoComplete="off"
                      spellCheck={false}
                    />
                  )}
                </div>
              ))}
            </section>
          );
        })}
        <Button type="submit">Save changes</Button>
      </form>
    </div>
  );
}

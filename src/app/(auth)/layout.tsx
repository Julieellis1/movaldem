export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-surface-base p-4">
      {/* Ambient glow behind the card (design system: violet halo on surface-base) */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(600px 320px at 50% 35%, rgba(160, 120, 255, 0.18), transparent 70%)",
        }}
      />
      <div className="relative w-full max-w-md rounded-xl border border-border-subtle bg-surface-card p-8 shadow-[0_0_60px_rgba(139,92,246,0.12)]">
        {children}
      </div>
    </main>
  );
}

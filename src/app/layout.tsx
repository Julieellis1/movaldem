import type { Metadata } from "next";
import { Suspense } from "react";
import { Inter, Plus_Jakarta_Sans } from "next/font/google";
import "material-symbols/index.css";
import "./globals.css";
import { SonnerToaster } from "@/components/shared/sonner-toaster";
import { Footer } from "@/components/site/footer";
import { Header } from "@/components/site/header";
import { SiteChrome } from "@/components/site/site-chrome";
import { db } from "@/db/client";
import { getSetting } from "@/modules/platform/settings/settings.service";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MOVALDEM",
  description: "Mountain of Victory at the Last Day Evangelical Ministry",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const churchName = await getSetting<string>(db, "church.name").catch(() => undefined);
  return (
    <html lang="en" className={`${inter.variable} ${jakarta.variable}`}>
      <body>
        <Suspense fallback={<>{children}</>}>
          <SiteChrome header={<Header churchName={churchName} />} footer={<Footer />}>
            {children}
          </SiteChrome>
        </Suspense>
        <SonnerToaster />
      </body>
    </html>
  );
}

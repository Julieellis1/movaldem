"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PRD 04 §8: WhatsApp, Facebook, X, Telegram, Copy Link.
// WhatsApp priority on mobile: use Web Share API where available, fallback to links.

export function buildShareLinks(url: string, text: string) {
  const encodedUrl = encodeURIComponent(url);
  const encodedText = encodeURIComponent(text);
  return {
    whatsapp: `https://wa.me/?text=${encodedText}%20${encodedUrl}`,
    facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`,
    x: `https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedText}`,
    telegram: `https://t.me/share/url?url=${encodedUrl}&text=${encodedText}`,
  };
}

export function ShareButtons({
  url,
  title = "Share this",
  text,
  className,
}: {
  url: string;
  title?: string;
  text?: string;
  className?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const [canNativeShare, setCanNativeShare] = React.useState(false);
  const message = text ?? title;

  React.useEffect(() => {
    setCanNativeShare(
      typeof navigator !== "undefined" && typeof navigator.share === "function",
    );
  }, []);

  const links = buildShareLinks(url, message);

  const nativeShare = async () => {
    try {
      await navigator.share({ title, text: message, url });
    } catch {
      // User dismissed — no-op.
    }
  };

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = url;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={cn("flex flex-wrap gap-2", className)} aria-label="Share">
      {canNativeShare && (
        <Button variant="default" size="sm" onClick={nativeShare}>
          Share
        </Button>
      )}
      <Button asChild variant="outline" size="sm">
        <a href={links.whatsapp} target="_blank" rel="noopener noreferrer" aria-label="Share on WhatsApp">
          WhatsApp
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={links.facebook} target="_blank" rel="noopener noreferrer" aria-label="Share on Facebook">
          Facebook
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={links.x} target="_blank" rel="noopener noreferrer" aria-label="Share on X">
          X
        </a>
      </Button>
      <Button asChild variant="outline" size="sm">
        <a href={links.telegram} target="_blank" rel="noopener noreferrer" aria-label="Share on Telegram">
          Telegram
        </a>
      </Button>
      <Button variant="outline" size="sm" onClick={copyLink} aria-live="polite">
        {copied ? "Copied" : "Copy link"}
      </Button>
    </div>
  );
}

export default ShareButtons;

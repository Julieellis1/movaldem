import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// PRD 04 §11: viewer + download link honoring downloadEnabled (05 §8).

export function PdfViewer({
  pdfUrl,
  downloadEnabled,
  downloadUrl,
  title = "Study notes (PDF)",
  className,
}: {
  pdfUrl?: string | null;
  downloadEnabled?: boolean;
  /** DL-01: tracked-download URL, preferred over the raw file for downloads. */
  downloadUrl?: string | null;
  title?: string;
  className?: string;
}) {
  const src = (pdfUrl ?? "").trim();
  if (!src) return null;
  const tracked = (downloadUrl ?? "").trim();
  return (
    <section id="pdf-viewer" aria-label={title} className={cn("w-full space-y-2", className)}>
      <iframe src={src} title={title} loading="lazy" className="h-[480px] w-full rounded-xl border border-border-subtle" />
      {downloadEnabled === true &&
        (tracked ? (
          <Button asChild variant="outline">
            <a href={tracked}>Download PDF</a>
          </Button>
        ) : (
          <Button asChild variant="outline">
            <a href={src} download>
              Download PDF
            </a>
          </Button>
        ))}
    </section>
  );
}

export default PdfViewer;

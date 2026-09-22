import { Toaster } from "@/components/ui/sonner";

// Thin wrapper mounted in the root layout so any server or client component
// can call sonner's toast() without re-importing the primitive.
export function SonnerToaster() {
  return <Toaster position="top-right" closeButton richColors />;
}

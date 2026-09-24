import { createRequire } from "node:module";
import type { ReactElement } from "react";

// `react-dom/server` cannot be statically imported from a module in the App
// Router's server layer — webpack rejects the bundle with "You're importing a
// component that imports react-dom/server". Resolving it through a Node
// `createRequire` at call time keeps it out of the module graph, so the
// react-email templates still render to static markup at runtime.
const nodeRequire = createRequire(import.meta.url);

export function renderToStaticMarkup(element: ReactElement): string {
  const { renderToStaticMarkup: render } = nodeRequire("react-dom/server") as typeof import("react-dom/server");
  return render(element);
}

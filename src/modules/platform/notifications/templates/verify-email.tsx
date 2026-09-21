import { renderToStaticMarkup } from "react-dom/server";
import VerifyEmailTemplate from "./verify-email-template";

export function renderVerifyEmail(props: { url: string; name: string }) {
  const html = renderToStaticMarkup(<VerifyEmailTemplate {...props} />);
  return { html, text: `Verify your email: ${props.url}` };
}

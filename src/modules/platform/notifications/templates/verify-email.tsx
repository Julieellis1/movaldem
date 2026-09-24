import VerifyEmailTemplate from "./verify-email-template";
import { renderToStaticMarkup } from "./render";

export function renderVerifyEmail(props: { url: string; name: string }) {
  const html = renderToStaticMarkup(<VerifyEmailTemplate {...props} />);
  return { html, text: `Verify your email: ${props.url}` };
}

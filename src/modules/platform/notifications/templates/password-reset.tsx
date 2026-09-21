import { renderToStaticMarkup } from "react-dom/server";
import PasswordResetTemplate from "./password-reset-template";

export function renderPasswordReset(props: { url: string; name: string }) {
  const html = renderToStaticMarkup(<PasswordResetTemplate {...props} />);
  return { html, text: `Reset your password: ${props.url}` };
}

import PasswordResetTemplate from "./password-reset-template";
import { renderToStaticMarkup } from "./render";

export function renderPasswordReset(props: { url: string; name: string }) {
  const html = renderToStaticMarkup(<PasswordResetTemplate {...props} />);
  return { html, text: `Reset your password: ${props.url}` };
}

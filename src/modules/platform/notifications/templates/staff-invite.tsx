import StaffInviteTemplate from "./staff-invite-template";
import { renderToStaticMarkup } from "./render";

export function renderStaffInvite(props: { url: string; name: string; role: string; inviter: string }) {
  const html = renderToStaticMarkup(<StaffInviteTemplate {...props} />);
  return { html, text: `You have been invited to the MOVALDEM staff as ${props.role}: ${props.url}` };
}

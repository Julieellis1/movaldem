import { renderToStaticMarkup } from "react-dom/server";
import StaffInviteTemplate from "./staff-invite-template";

export function renderStaffInvite(props: { url: string; name: string; role: string; inviter: string }) {
  const html = renderToStaticMarkup(<StaffInviteTemplate {...props} />);
  return { html, text: `You have been invited to the MOVALDEM staff as ${props.role}: ${props.url}` };
}

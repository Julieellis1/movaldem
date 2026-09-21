import { Html, Body, Container, Heading, Text, Button, Link, Section, Hr, Preview } from "react-email";

const CHURCH_NAME = "Mountain of Victory at the Last Day Evangelical Ministry";

export default function StaffInviteTemplate({
  url,
  name,
  role,
  inviter,
}: {
  url: string;
  name: string;
  role: string;
  inviter: string;
}) {
  return (
    <Html>
      <Preview>You have been invited to the MOVALDEM staff</Preview>
      <Body style={body}>
        <Container style={container}>
          <Section style={header}>
            <Text style={brand}>MOVALDEM</Text>
            <Text style={brandSub}>Luminous Sanctuary</Text>
          </Section>
          <Heading style={heading}>You have been invited</Heading>
          <Text style={paragraph}>
            Hi {name}, {inviter} has invited you to join the MOVALDEM staff as{" "}
            <strong style={strong}>{role}</strong>. Accept the invitation to set up your account and
            help run the platform.
          </Text>
          <Section style={buttonSection}>
            <Button style={button} href={url}>
              Accept invitation
            </Button>
          </Section>
          <Text style={paragraph}>Or paste this link into your browser:</Text>
          <Text style={linkText}>
            <Link href={url} style={link}>
              {url}
            </Link>
          </Text>
          <Hr style={hr} />
          <Text style={footer}>
            {CHURCH_NAME}. If you were not expecting this invitation, you can safely ignore this
            message.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

const body = { backgroundColor: "#0d0d11", margin: "0", padding: "24px 0" };
const container = {
  backgroundColor: "#13141b",
  borderRadius: "16px",
  border: "1px solid rgba(255,255,255,0.08)",
  maxWidth: "560px",
  margin: "0 auto",
  padding: "40px 32px",
};
const header = { marginBottom: "32px", textAlign: "center" as const };
const brand = {
  color: "#d0bcff",
  fontSize: "24px",
  fontWeight: 700,
  letterSpacing: "2px",
  margin: "0",
};
const brandSub = { color: "#9ca3af", fontSize: "12px", letterSpacing: "3px", margin: "4px 0 0" };
const heading = { color: "#ffffff", fontSize: "28px", fontWeight: 700, margin: "0 0 16px" };
const paragraph = { color: "#cbc3d7", fontSize: "15px", lineHeight: "24px", margin: "0 0 20px" };
const strong = { color: "#ffffff", fontWeight: 700 };
const buttonSection = { textAlign: "center" as const, margin: "28px 0" };
const button = {
  backgroundColor: "#a078ff",
  borderRadius: "999px",
  color: "#0d0d11",
  fontSize: "15px",
  fontWeight: 700,
  padding: "14px 32px",
  textDecoration: "none",
};
const linkText = { margin: "0 0 24px" };
const link = { color: "#a078ff", fontSize: "13px", wordBreak: "break-all" as const };
const hr = { borderColor: "rgba(255,255,255,0.08)", margin: "32px 0" };
const footer = { color: "#6b7280", fontSize: "12px", lineHeight: "18px", margin: "0" };

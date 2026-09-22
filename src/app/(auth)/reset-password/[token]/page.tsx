import { redirect } from "next/navigation";

// better-auth 1.7 builds reset links as /reset-password/<token>?callbackURL=…
// Normalise to the query form the client page already understands.
export default function ResetPasswordTokenPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  return (async () => {
    const { token } = await params;
    const sp = await searchParams;
    const callbackURL = typeof sp.callbackURL === "string" ? sp.callbackURL : undefined;
    const query = new URLSearchParams({ token });
    if (callbackURL) query.set("callbackURL", callbackURL);
    redirect(`/reset-password?${query.toString()}`);
  })();
}

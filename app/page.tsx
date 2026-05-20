import { redirect } from "next/navigation";
import { getPinSessionFromCookie } from "@/lib/auth/pin-session";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const session = await getPinSessionFromCookie();
  if (!session) redirect("/login");
  redirect(session.role === "director" ? "/admin" : "/dashboard");
}

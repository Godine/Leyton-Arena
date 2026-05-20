import { redirect } from "next/navigation";
import { getPinSessionFromCookie } from "@/lib/auth/pin-session";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getPinSessionFromCookie();
  if (session) {
    redirect(session.role === "director" ? "/admin" : "/dashboard");
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
      <div className="mb-6 flex flex-col items-center gap-2">
        <p className="text-eyebrow uppercase tracking-wide text-muted-foreground">Leyton</p>
        <h1 className="text-section font-medium">Arena</h1>
      </div>
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Sign in</CardTitle>
          <CardDescription>
            Choose your role and enter the 4-digit PIN. Demo mode — replace with real auth before
            production.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LoginForm />
        </CardContent>
      </Card>
    </main>
  );
}

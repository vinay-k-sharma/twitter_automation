import { redirect } from "next/navigation";

import { LoginForm } from "@/components/login-form";
import { getCurrentUser } from "@/lib/auth";
import { env } from "@/lib/env";

export default async function LoginPage() {
  const user = await getCurrentUser();
  if (user) {
    redirect("/dashboard");
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md items-center px-4">
      <LoginForm xOAuthAvailable={Boolean(env.X_CLIENT_ID && env.X_CALLBACK_URL)} />
    </main>
  );
}

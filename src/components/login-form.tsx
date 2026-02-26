"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type FormState = {
  email: string;
  name: string;
  internalPlan: "FREE" | "PRO" | "TEAM";
};

type Props = {
  xOAuthAvailable: boolean;
};

function formatOAuthError(code: string) {
  const knownErrors: Record<string, string> = {
    missing_x_oauth_env: "X OAuth login is not configured. Set X_CLIENT_ID and X_CALLBACK_URL in env.",
    missing_x_app_credentials: "X app credentials are missing.",
    missing_oauth_params: "Missing OAuth callback parameters from X.",
    state_mismatch: "OAuth state mismatch. Please retry X login.",
    invalid_state: "OAuth state expired or invalid. Please retry X login.",
    access_denied: "X authorization was denied."
  };

  if (knownErrors[code]) {
    return knownErrors[code];
  }

  if (code.startsWith("X OAuth token exchange failed")) {
    return "X token exchange failed. Verify your X app client ID/secret and callback URL.";
  }

  return code.replace(/_/g, " ");
}

export function LoginForm(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [form, setForm] = useState<FormState>({
    email: "demo@xgrowth.app",
    name: "Demo User",
    internalPlan: "PRO"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const oauthErrorCode = searchParams.get("x_error");
  const oauthError = oauthErrorCode ? formatOAuthError(oauthErrorCode) : null;
  const visibleError = error ?? oauthError;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch("/api/auth/demo-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Login failed");
      }
      router.push("/dashboard");
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="card space-y-4" onSubmit={onSubmit}>
      <div>
        <h1 className="text-xl font-semibold">X Growth Autopilot</h1>
        <p className="mt-1 text-sm text-zinc-400">Demo login for MVP setup.</p>
      </div>

      <button
        className="button-secondary w-full"
        type="button"
        disabled={!props.xOAuthAvailable || loading}
        onClick={() => {
          window.location.href = "/api/auth/x/login";
        }}
      >
        Continue with X OAuth
      </button>
      {!props.xOAuthAvailable ? (
        <p className="text-xs text-amber-400">
          X OAuth login is disabled because global `X_CLIENT_ID` + `X_CALLBACK_URL` are not configured.
        </p>
      ) : null}

      <div>
        <label className="label">Email</label>
        <input
          className="input"
          type="email"
          value={form.email}
          onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
          required
        />
      </div>

      <div>
        <label className="label">Name</label>
        <input
          className="input"
          type="text"
          value={form.name}
          onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
        />
      </div>

      <div>
        <label className="label">Internal SaaS Plan</label>
        <select
          className="input"
          value={form.internalPlan}
          onChange={(event) =>
            setForm((prev) => ({
              ...prev,
              internalPlan: event.target.value as FormState["internalPlan"]
            }))
          }
        >
          <option value="FREE">FREE</option>
          <option value="PRO">PRO</option>
          <option value="TEAM">TEAM</option>
        </select>
      </div>

      {visibleError ? <p className="text-sm text-rose-400">{visibleError}</p> : null}

      <button className="button w-full" type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Continue"}
      </button>
    </form>
  );
}

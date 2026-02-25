"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type FormState = {
  email: string;
  name: string;
  internalPlan: "FREE" | "PRO" | "TEAM";
};

export function LoginForm() {
  const router = useRouter();
  const [form, setForm] = useState<FormState>({
    email: "demo@xgrowth.app",
    name: "Demo User",
    internalPlan: "PRO"
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      {error ? <p className="text-sm text-rose-400">{error}</p> : null}

      <button className="button w-full" type="submit" disabled={loading}>
        {loading ? "Signing in..." : "Continue"}
      </button>
    </form>
  );
}

"use client";

import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

type Props = {
  user: {
    id: string;
    email: string;
    name: string | null;
    internalPlan: "FREE" | "PRO" | "TEAM";
  };
  xConnection: {
    xUserId: string;
    username: string | null;
    xPaidTier: "FREE" | "BASIC" | "PRO" | "ENTERPRISE";
  } | null;
  xAppCredentials: {
    configured: boolean;
    callbackUrl: string;
  };
  xOAuthEnabled: boolean;
  topics: Array<{
    id: string;
    keyword: string;
    language: string;
    minLikes: number;
    excludeWords: string[];
  }>;
  replyConfig: {
    tone: "PROFESSIONAL" | "WITTY" | "INSIGHTFUL";
    bioContext: string | null;
    ctaStyle: "SOFT" | "DIRECT" | "NONE";
    likeOnReply: boolean;
    followOnReply: boolean;
  };
  autoTweetConfig: {
    topics: string[];
    frequencyMinutes: number;
    windowStart: string;
    windowEnd: string;
    threadMode: boolean;
    language: string;
    enabled: boolean;
  };
  candidates: Array<{
    id: string;
    tweetId: string;
    authorHandle: string | null;
    text: string;
    discoveredAt: string;
    repliedAt: string | null;
    likedAt: string | null;
  }>;
  logs: Array<{
    id: string;
    action: string;
    status: string;
    message: string | null;
    createdAt: string;
  }>;
  limits: {
    limits: {
      repliesPerDay: number;
      tweetsPerDay: number;
      likesPerDay: number;
      topicsTracked: number;
      hourlyActionCap: number;
      allowFollow: boolean;
    };
    usage: {
      repliesToday: number;
      tweetsToday: number;
      likesToday: number;
      followsToday: number;
      topicsTracked: number;
      hourlyActions: number;
    };
  } | null;
};

async function callApi(url: string, options?: RequestInit) {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers ?? {})
    }
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.error ?? `Request failed: ${response.status}`);
  }
  return payload;
}

function formatOAuthError(code: string) {
  const knownErrors: Record<string, string> = {
    missing_x_oauth_env:
      "Missing global X OAuth env vars. Configure X_CLIENT_ID and X_CALLBACK_URL or save BYOA credentials.",
    missing_x_app_credentials:
      "Missing X app credentials. Save your X Client ID/Secret + callback URL in the BYOA section first.",
    missing_oauth_params: "Missing OAuth callback parameters from X.",
    state_mismatch: "OAuth state mismatch. Please retry connecting your X account.",
    invalid_state: "OAuth state expired or invalid. Please retry connecting your X account.",
    access_denied: "X authorization was denied."
  };

  if (knownErrors[code]) {
    return knownErrors[code];
  }

  if (code.startsWith("X OAuth token exchange failed")) {
    if (code.includes("Missing valid authorization header") || code.includes("invalid_client")) {
      return "X rejected app credentials. Use OAuth 2.0 Client ID + Client Secret from X Developer Portal (not @username), save BYOA again, and retry connect.";
    }
    return "X token exchange failed. Verify X_CLIENT_ID, X_CLIENT_SECRET, and X_CALLBACK_URL match your X app settings.";
  }

  return code.replace(/_/g, " ");
}

function formatAutoPostResult(payload: any) {
  const result = payload?.result;
  if (!result) {
    return "Auto-post triggered.";
  }

  if (result.posted > 0) {
    return `Auto-post published ${result.posted} tweet${result.posted > 1 ? "s" : ""}.`;
  }

  if (result.reason) {
    return `Auto-post skipped: ${String(result.reason).replace(/_/g, " ")}.`;
  }

  return "Auto-post run completed with no published tweet.";
}

export function DashboardClient(props: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const [topicForm, setTopicForm] = useState({
    keyword: "",
    language: "en",
    minLikes: "0",
    excludeWords: ""
  });

  const [replyForm, setReplyForm] = useState({
    tone: props.replyConfig.tone,
    bioContext: props.replyConfig.bioContext ?? "",
    ctaStyle: props.replyConfig.ctaStyle,
    likeOnReply: props.replyConfig.likeOnReply,
    followOnReply: props.replyConfig.followOnReply
  });

  const [autoForm, setAutoForm] = useState({
    topics: props.autoTweetConfig.topics.join(", "),
    frequencyMinutes: String(props.autoTweetConfig.frequencyMinutes),
    windowStart: props.autoTweetConfig.windowStart,
    windowEnd: props.autoTweetConfig.windowEnd,
    threadMode: props.autoTweetConfig.threadMode,
    language: props.autoTweetConfig.language,
    enabled: props.autoTweetConfig.enabled
  });
  const [xAppForm, setXAppForm] = useState({
    clientId: "",
    clientSecret: "",
    callbackUrl: props.xAppCredentials.callbackUrl
  });

  const limits = props.limits?.limits;
  const usage = props.limits?.usage;

  const usageLines = useMemo(() => {
    if (!limits || !usage) {
      return [];
    }
    return [
      `Replies: ${usage.repliesToday}/${limits.repliesPerDay}`,
      `Tweets: ${usage.tweetsToday}/${limits.tweetsPerDay}`,
      `Likes: ${usage.likesToday}/${limits.likesPerDay}`,
      `Follows: ${usage.followsToday}/400`,
      `Topics tracked: ${usage.topicsTracked}/${limits.topicsTracked}`,
      `Hourly actions: ${usage.hourlyActions}/${limits.hourlyActionCap}`,
      `Follow enabled: ${limits.allowFollow ? "yes" : "no"}`
    ];
  }, [limits, usage]);

  const oauthConnected = searchParams.get("x_connected") === "1";
  const oauthErrorCode = searchParams.get("x_error");
  const oauthError = oauthErrorCode ? formatOAuthError(oauthErrorCode) : null;
  const visibleNotice = notice ?? (oauthConnected ? "X account connected successfully." : null);
  const visibleError = error ?? oauthError;
  const canConnectX = props.xOAuthEnabled;

  async function perform(key: string, callback: () => Promise<void>) {
    setBusyKey(key);
    setError(null);
    setNotice(null);
    try {
      await callback();
      setNotice((prev) => prev ?? "Saved.");
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Request failed");
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="card flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">X Growth Autopilot</h1>
          <p className="mt-1 text-sm text-zinc-400">
            {props.user.name || "User"} ({props.user.email}) • Internal plan: {props.user.internalPlan}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {props.xConnection
              ? `Connected as @${props.xConnection.username ?? props.xConnection.xUserId} • X tier: ${props.xConnection.xPaidTier}`
              : "No X account connected"}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {props.xConnection ? (
            <button
              className="button-secondary"
              disabled={!canConnectX}
              onClick={() => {
                if (canConnectX) {
                  window.location.href = "/api/x/connect";
                }
              }}
            >
              Reconnect X
            </button>
          ) : (
            <button
              className="button"
              disabled={!canConnectX}
              onClick={() => {
                if (canConnectX) {
                  window.location.href = "/api/x/connect";
                }
              }}
            >
              Connect X Account
            </button>
          )}

          <button
            className="button-secondary"
            onClick={() =>
              perform("logout", async () => {
                await callApi("/api/auth/logout", { method: "POST" });
                window.location.href = "/login";
              })
            }
          >
            Logout
          </button>
        </div>
      </section>

      {visibleNotice ? <p className="text-sm text-emerald-400">{visibleNotice}</p> : null}
      {visibleError ? <p className="text-sm text-rose-400">{visibleError}</p> : null}

      <section className="card space-y-3">
        <div className="flex items-center justify-between gap-4">
          <h2 className="text-base font-semibold">Bring your own X app (BYOA)</h2>
          <span className="text-xs text-zinc-400">
            {props.xAppCredentials.configured
              ? "Configured"
              : props.xOAuthEnabled
                ? "Using global env"
                : "Not configured"}
          </span>
        </div>
        <p className="text-sm text-zinc-400">
          Save your own X Client ID/Secret so this workspace uses your app rate limits and OAuth config.
        </p>
        <form
          className="grid grid-cols-1 gap-3 md:grid-cols-3"
          onSubmit={(event) => {
            event.preventDefault();
            void perform("x_credentials", async () => {
              await callApi("/api/x/credentials", {
                method: "PUT",
                body: JSON.stringify({
                  clientId: xAppForm.clientId || undefined,
                  clientSecret: xAppForm.clientSecret || undefined,
                  callbackUrl: xAppForm.callbackUrl || undefined
                })
              });
              setXAppForm((prev) => ({
                ...prev,
                clientSecret: ""
              }));
              setNotice("X app credentials saved.");
            });
          }}
        >
          <div>
            <label className="label">X Client ID</label>
            <input
              className="input"
              placeholder={props.xAppCredentials.configured ? "Saved (leave blank to keep)" : "Paste Client ID"}
              value={xAppForm.clientId}
              onChange={(event) => setXAppForm((prev) => ({ ...prev, clientId: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">X Client Secret</label>
            <input
              className="input"
              type="password"
              placeholder={props.xAppCredentials.configured ? "Saved (optional update)" : "Paste Client Secret"}
              value={xAppForm.clientSecret}
              onChange={(event) => setXAppForm((prev) => ({ ...prev, clientSecret: event.target.value }))}
            />
          </div>
          <div>
            <label className="label">OAuth callback URL</label>
            <input
              className="input"
              value={xAppForm.callbackUrl}
              onChange={(event) => setXAppForm((prev) => ({ ...prev, callbackUrl: event.target.value }))}
            />
          </div>
          <div className="md:col-span-3">
            <button className="button" disabled={busyKey !== null}>
              {busyKey === "x_credentials" ? "Saving..." : "Save X app credentials"}
            </button>
          </div>
        </form>
        {!canConnectX ? (
          <p className="text-xs text-amber-400">
            Connect X stays disabled until you either save BYOA credentials above or set global `X_CLIENT_ID` +
            `X_CALLBACK_URL` in env.
          </p>
        ) : null}
      </section>

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-1">
          <h2 className="mb-3 text-base font-semibold">Plan & hard caps</h2>
          {usageLines.length ? (
            <ul className="space-y-2 text-sm text-zinc-300">
              {usageLines.map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-zinc-400">Connect X account to compute effective limits.</p>
          )}
        </div>

        <div className="card lg:col-span-2">
          <h2 className="mb-3 text-base font-semibold">Manual controls</h2>
          <div className="flex flex-wrap gap-2">
            <button
              className="button"
              disabled={busyKey !== null}
              onClick={() =>
                perform("discover", async () => {
                  await callApi("/api/x/discover", { method: "POST" });
                  setNotice("Discovery job queued.");
                })
              }
            >
              {busyKey === "discover" ? "Queueing..." : "Run Discovery"}
            </button>

            <button
              className="button"
              disabled={busyKey !== null}
              onClick={() =>
                perform("engage", async () => {
                  await callApi("/api/x/engage", { method: "POST" });
                  setNotice("Engagement job queued.");
                })
              }
            >
              {busyKey === "engage" ? "Queueing..." : "Run Engage"}
            </button>

            <button
              className="button"
              disabled={busyKey !== null}
              onClick={() =>
                perform("autopost", async () => {
                  const payload = await callApi("/api/x/autopost", { method: "POST" });
                  setNotice(formatAutoPostResult(payload));
                })
              }
            >
              {busyKey === "autopost" ? "Queueing..." : "Run Auto-post"}
            </button>
          </div>
          <p className="mt-3 text-xs text-zinc-400">
            Discovery/engage/autopost all queue to workers. Use <code>?mode=inline&amp;force=1</code> only for local
            autopost smoke tests.
          </p>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card space-y-4">
          <h2 className="text-base font-semibold">Tweet discovery topics</h2>
          <form
            className="grid grid-cols-1 gap-3 md:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("topic_create", async () => {
                await callApi("/api/topics", {
                  method: "POST",
                  body: JSON.stringify({
                    keyword: topicForm.keyword,
                    language: topicForm.language,
                    minLikes: Number(topicForm.minLikes),
                    excludeWords: topicForm.excludeWords
                      .split(",")
                      .map((word) => word.trim())
                      .filter(Boolean)
                  })
                });
                setTopicForm({
                  keyword: "",
                  language: "en",
                  minLikes: "0",
                  excludeWords: ""
                });
              });
            }}
          >
            <div className="md:col-span-2">
              <label className="label">Keyword/topic</label>
              <input
                className="input"
                value={topicForm.keyword}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, keyword: event.target.value }))}
                required
              />
            </div>
            <div>
              <label className="label">Language</label>
              <input
                className="input"
                value={topicForm.language}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, language: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">Min likes filter</label>
              <input
                className="input"
                type="number"
                min={0}
                value={topicForm.minLikes}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, minLikes: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="label">Exclude words (comma-separated)</label>
              <input
                className="input"
                value={topicForm.excludeWords}
                onChange={(event) => setTopicForm((prev) => ({ ...prev, excludeWords: event.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <button className="button w-full" disabled={busyKey !== null}>
                {busyKey === "topic_create" ? "Saving..." : "Add topic"}
              </button>
            </div>
          </form>

          <div className="space-y-2">
            {props.topics.map((topic) => (
              <div key={topic.id} className="rounded-md border border-zinc-800 p-3 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium">
                    {topic.keyword} • {topic.language} • min likes {topic.minLikes}
                  </p>
                  <button
                    className="button-secondary"
                    onClick={() =>
                      perform(`delete_${topic.id}`, async () => {
                        await callApi(`/api/topics/${topic.id}`, { method: "DELETE" });
                      })
                    }
                  >
                    Remove
                  </button>
                </div>
                {topic.excludeWords.length ? (
                  <p className="mt-1 text-xs text-zinc-400">Exclude: {topic.excludeWords.join(", ")}</p>
                ) : null}
              </div>
            ))}
            {props.topics.length === 0 ? <p className="text-sm text-zinc-400">No topics configured yet.</p> : null}
          </div>
        </div>

        <div className="space-y-6">
          <form
            className="card space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("reply_config", async () => {
                await callApi("/api/config/reply", {
                  method: "PUT",
                  body: JSON.stringify({
                    tone: replyForm.tone,
                    bioContext: replyForm.bioContext || null,
                    ctaStyle: replyForm.ctaStyle,
                    likeOnReply: replyForm.likeOnReply,
                    followOnReply: replyForm.followOnReply
                  })
                });
              });
            }}
          >
            <h2 className="text-base font-semibold">AI reply configuration</h2>
            <div>
              <label className="label">Tone</label>
              <select
                className="input"
                value={replyForm.tone}
                onChange={(event) =>
                  setReplyForm((prev) => ({
                    ...prev,
                    tone: event.target.value as Props["replyConfig"]["tone"]
                  }))
                }
              >
                <option value="PROFESSIONAL">Professional</option>
                <option value="WITTY">Witty</option>
                <option value="INSIGHTFUL">Insightful</option>
              </select>
            </div>
            <div>
              <label className="label">Bio context</label>
              <textarea
                className="input min-h-24"
                value={replyForm.bioContext}
                onChange={(event) => setReplyForm((prev) => ({ ...prev, bioContext: event.target.value }))}
              />
            </div>
            <div>
              <label className="label">CTA style</label>
              <select
                className="input"
                value={replyForm.ctaStyle}
                onChange={(event) =>
                  setReplyForm((prev) => ({
                    ...prev,
                    ctaStyle: event.target.value as Props["replyConfig"]["ctaStyle"]
                  }))
                }
              >
                <option value="SOFT">Soft</option>
                <option value="DIRECT">Direct</option>
                <option value="NONE">None</option>
              </select>
            </div>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={replyForm.likeOnReply}
                onChange={(event) => setReplyForm((prev) => ({ ...prev, likeOnReply: event.target.checked }))}
              />
              Like tweet after replying
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={replyForm.followOnReply}
                onChange={(event) => setReplyForm((prev) => ({ ...prev, followOnReply: event.target.checked }))}
              />
              Follow author after replying (premium-only)
            </label>
            <button className="button w-full" disabled={busyKey !== null}>
              {busyKey === "reply_config" ? "Saving..." : "Save reply config"}
            </button>
          </form>

          <form
            className="card space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform("auto_config", async () => {
                await callApi("/api/config/autotweet", {
                  method: "PUT",
                  body: JSON.stringify({
                    topics: autoForm.topics
                      .split(",")
                      .map((item) => item.trim())
                      .filter(Boolean),
                    frequencyMinutes: Number(autoForm.frequencyMinutes),
                    windowStart: autoForm.windowStart,
                    windowEnd: autoForm.windowEnd,
                    threadMode: autoForm.threadMode,
                    language: autoForm.language,
                    enabled: autoForm.enabled
                  })
                });
              });
            }}
          >
            <h2 className="text-base font-semibold">Auto tweet posting</h2>

            <div>
              <label className="label">Topics (comma-separated)</label>
              <input
                className="input"
                value={autoForm.topics}
                onChange={(event) => setAutoForm((prev) => ({ ...prev, topics: event.target.value }))}
              />
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label">Frequency minutes</label>
                <input
                  className="input"
                  type="number"
                  min={15}
                  max={1440}
                  value={autoForm.frequencyMinutes}
                  onChange={(event) => setAutoForm((prev) => ({ ...prev, frequencyMinutes: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">Language</label>
                <input
                  className="input"
                  value={autoForm.language}
                  onChange={(event) => setAutoForm((prev) => ({ ...prev, language: event.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <div>
                <label className="label">Window start</label>
                <input
                  className="input"
                  type="time"
                  value={autoForm.windowStart}
                  onChange={(event) => setAutoForm((prev) => ({ ...prev, windowStart: event.target.value }))}
                />
              </div>
              <div>
                <label className="label">Window end</label>
                <input
                  className="input"
                  type="time"
                  value={autoForm.windowEnd}
                  onChange={(event) => setAutoForm((prev) => ({ ...prev, windowEnd: event.target.value }))}
                />
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={autoForm.threadMode}
                onChange={(event) => setAutoForm((prev) => ({ ...prev, threadMode: event.target.checked }))}
              />
              Thread mode
            </label>
            <label className="flex items-center gap-2 text-sm text-zinc-300">
              <input
                type="checkbox"
                checked={autoForm.enabled}
                onChange={(event) => setAutoForm((prev) => ({ ...prev, enabled: event.target.checked }))}
              />
              Enable automated posting
            </label>

            <button className="button w-full" disabled={busyKey !== null}>
              {busyKey === "auto_config" ? "Saving..." : "Save auto-post config"}
            </button>
          </form>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="card">
          <h2 className="mb-3 text-base font-semibold">Discovered tweets</h2>
          <div className="space-y-3">
            {props.candidates.map((candidate) => (
              <div key={candidate.id} className="rounded-md border border-zinc-800 p-3 text-sm">
                <p className="text-zinc-300">{candidate.text}</p>
                <p className="mt-2 text-xs text-zinc-500">
                  @{candidate.authorHandle ?? "unknown"} • {new Date(candidate.discoveredAt).toLocaleString()} •{" "}
                  {candidate.repliedAt ? "replied" : "pending"}
                </p>
              </div>
            ))}
            {props.candidates.length === 0 ? (
              <p className="text-sm text-zinc-400">No candidates yet. Run discovery first.</p>
            ) : null}
          </div>
        </div>

        <div className="card">
          <h2 className="mb-3 text-base font-semibold">Activity log</h2>
          <div className="space-y-2">
            {props.logs.map((log) => (
              <div key={log.id} className="rounded-md border border-zinc-800 p-3">
                <p className="text-sm font-medium">
                  {log.action} • <span className="text-zinc-400">{log.status}</span>
                </p>
                <p className="text-xs text-zinc-500">{new Date(log.createdAt).toLocaleString()}</p>
                {log.message ? <p className="mt-1 text-sm text-zinc-300">{log.message}</p> : null}
              </div>
            ))}
            {props.logs.length === 0 ? <p className="text-sm text-zinc-400">No events yet.</p> : null}
          </div>
        </div>
      </section>
    </div>
  );
}

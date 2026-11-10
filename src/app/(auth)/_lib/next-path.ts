/**
 * Where to go after logging in: the `?next=` path the proxy added, if it's a
 * path on this site, otherwise the dashboard. Rejects "//evil.com" and full URLs.
 */
export function nextPath(fallback = "/dashboard") {
  if (typeof window === "undefined") return fallback;
  const next = new URLSearchParams(window.location.search).get("next");
  return next && next.startsWith("/") && !next.startsWith("//") ? next : fallback;
}

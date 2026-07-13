export function isInviteAuthCallback(url: URL): boolean {
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  if (!hash) return false;

  const params = new URLSearchParams(hash);
  const type = params.get("type");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  return !!(type === "invite" && (accessToken || refreshToken));
}

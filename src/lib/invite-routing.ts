export function isInviteAuthCallback(url: URL): boolean {
  const params = new URLSearchParams(url.search);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = hash ? new URLSearchParams(hash) : null;

  const type = params.get("type") ?? hashParams?.get("type");
  const accessToken = params.get("access_token") ?? hashParams?.get("access_token");
  const refreshToken = params.get("refresh_token") ?? hashParams?.get("refresh_token");
  const token = params.get("token") ?? hashParams?.get("token");

  return !!(
    type === "invite" &&
    (accessToken || refreshToken || token)
  );
}

export function getInviteAuthTokens(url: URL): { accessToken?: string; refreshToken?: string; type?: string | null } | null {
  const params = new URLSearchParams(url.search);
  const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
  const hashParams = hash ? new URLSearchParams(hash) : null;

  const accessToken = params.get("access_token") ?? hashParams?.get("access_token");
  const refreshToken = params.get("refresh_token") ?? hashParams?.get("refresh_token");
  const type = params.get("type") ?? hashParams?.get("type");

  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken, type };
}

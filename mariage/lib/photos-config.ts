import "server-only";

// Only public Google Photos sharing links; never fetch or synchronise albums.
export function googlePhotosUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" || url.username || url.password) return null;
    if (url.hostname === "photos.app.goo.gl" && url.pathname.length > 1) return value.trim();
    if (url.hostname === "photos.google.com" && url.pathname.startsWith("/share/")) return value.trim();
  } catch { /* Unconfigured and invalid links share the same clean fallback. */ }
  return null;
}

export function photosAlbums() {
  return {
    official: googlePhotosUrl(process.env.WEDDING_OFFICIAL_GOOGLE_PHOTOS_URL),
    guest: googlePhotosUrl(process.env.WEDDING_GUEST_GOOGLE_PHOTOS_URL),
  };
}

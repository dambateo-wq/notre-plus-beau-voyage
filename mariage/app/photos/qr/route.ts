import QRCode from "qrcode";
import { photosAuthenticated } from "@/lib/photos-auth";
import { photosAlbums } from "@/lib/photos-config";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
  if (!(await photosAuthenticated())) return new Response(null, { status: 401, headers });
  const url = photosAlbums().guest;
  if (!url) return new Response(null, { status: 404, headers });
  const png = await QRCode.toBuffer(url, { type: "png", width: 1600, margin: 4,
    errorCorrectionLevel: "M", color: { dark: "#000000", light: "#ffffff" } });
  return new Response(new Uint8Array(png), { headers: { ...headers, "Content-Type": "image/png",
    "Content-Disposition": `${new URL(request.url).searchParams.has("download") ? "attachment" : "inline"}; filename="photos-du-week-end-qr.png"` } });
}

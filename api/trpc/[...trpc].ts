import "dotenv/config";
import { createApiApp } from "../../server/_core/app";

const app = createApiApp();

function normalizeTrpcUrl(req: any) {
  const currentUrl = String(req.url ?? "");
  if (currentUrl.startsWith("/api/trpc")) return;

  const rawPath = req.query?.trpc;
  const parts = Array.isArray(rawPath) ? rawPath : rawPath ? [String(rawPath)] : [];
  const query = currentUrl.includes("?") ? currentUrl.slice(currentUrl.indexOf("?")) : "";
  req.url = `/api/trpc/${parts.join("/")}${query}`;
}

export default function handler(req: any, res: any) {
  normalizeTrpcUrl(req);
  return app(req, res);
}

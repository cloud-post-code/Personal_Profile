import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/util";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/", disallow: ["/admin", "/api"] }],
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}

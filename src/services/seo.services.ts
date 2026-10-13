
import * as cheerio from "cheerio";

export async function scanWebsite(inputUrl: string) {
  const url = new URL(
    /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`
  );

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": "BulkSEOReporter/1.0" },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Website returned status ${response.status}`);
  }

  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("text/html")) {
    throw new Error("URL did not return an HTML page");
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  const finalUrl = new URL(response.url || url.href);

  const title = $("title").first().text().trim();
  const description =
    $('meta[name="description"]').attr("content")?.trim() || "";

  const headings = {
    h1: $("h1").map((_, el) => $(el).text().trim()).get(),
    h2: $("h2").length,
    h3: $("h3").length,
  };

  const images = $("img");
  const links = $("a[href]");

  const internalLinks: string[] = [];
  const externalLinks: string[] = [];
  let nofollowLinks = 0;

  links.each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;

    const rel = ($(el).attr("rel") || "").toLowerCase().split(/\s+/);
    if (rel.includes("nofollow")) nofollowLinks++;

    try {
      const linkUrl = new URL(href, finalUrl);

      if (!["http:", "https:"].includes(linkUrl.protocol)) return;

      if (linkUrl.hostname === finalUrl.hostname) {
        internalLinks.push(linkUrl.href);
      } else {
        externalLinks.push(linkUrl.href);
      }
    } catch {
      // Ignore malformed links.
    }
  });

  const robotsMeta = $('meta[name="robots"]').attr("content") || "";
  const googlebotMeta = $('meta[name="googlebot"]').attr("content") || "";
  const robotsHeader = response.headers.get("x-robots-tag") || "";
  const indexDirectives = [
    robotsMeta,
    googlebotMeta,
    robotsHeader,
  ].join(" ").toLowerCase();

  const imagesWithoutAlt = images.filter((_, el) => {
    return !$(el).attr("alt")?.trim();
  }).length;

  const imagesWithoutDimensions = images.filter((_, el) => {
    return !$(el).attr("width") || !$(el).attr("height");
  }).length;

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const wordCount = bodyText ? bodyText.split(" ").length : 0;

  const canonicalHref = $('link[rel="canonical"]').attr("href");
  let canonical: string | null = null;

  try {
    canonical = canonicalHref
      ? new URL(canonicalHref, finalUrl).href
      : null;
  } catch {
    // Invalid canonical URL.
  }

  const jsonLdScripts = $('script[type="application/ld+json"]');
  let validJsonLd = 0;
  let invalidJsonLd = 0;

  jsonLdScripts.each((_, el) => {
    try {
      JSON.parse($(el).text());
      validJsonLd++;
    } catch {
      invalidJsonLd++;
    }
  });

  const checks = [
    {
      name: "Page title",
      passed: title.length > 0,
      details: title ? `${title.length} characters` : "Missing title",
      recommendation: "Add a descriptive, unique page title.",
    },
    {
      name: "Title length",
      passed: title.length >= 30 && title.length <= 60,
      details: `${title.length} characters`,
      recommendation: "Consider a title around 30–60 characters. This is a guideline, not a ranking rule.",
    },
    {
      name: "Meta description",
      passed: description.length > 0,
      details: description ? `${description.length} characters` : "Missing",
      recommendation: "Write a useful page-specific meta description.",
    },
    {
      name: "Description length",
      passed: description.length >= 120 && description.length <= 160,
      details: `${description.length} characters`,
      recommendation: "Consider a concise description around 120–160 characters.",
    },
    {
      name: "H1 heading",
      passed: headings.h1.length === 1,
      details: `${headings.h1.length} H1 headings`,
      recommendation: "Use a clear main heading. Check missing or multiple H1s.",
    },
    {
      name: "Canonical URL",
      passed: canonical !== null,
      details: canonical || "Missing or invalid",
      recommendation: "Review whether this page needs a canonical URL.",
    },
    {
      name: "Indexability",
      passed: !/\bnoindex\b/.test(indexDirectives),
      details: indexDirectives || "No noindex directive detected",
      recommendation: "Review robots directives if this page should appear in search.",
    },
    {
      name: "Viewport",
      passed: $('meta[name="viewport"]').length > 0,
      details: $('meta[name="viewport"]').length ? "Present" : "Missing",
      recommendation: "Add a suitable mobile viewport meta tag.",
    },
    {
      name: "Document language",
      passed: Boolean($("html").attr("lang")),
      details: $("html").attr("lang") || "Missing",
      recommendation: "Declare the page language in the HTML element.",
    },
    {
      name: "Open Graph",
      passed: Boolean($('meta[property="og:title"]').attr("content")),
      details: $('meta[property="og:title"]').length ? "Present" : "Missing",
      recommendation: "Add Open Graph metadata for social sharing.",
    },
    {
      name: "Structured data",
      passed: validJsonLd > 0,
      details: `${validJsonLd} valid JSON-LD script(s), ${invalidJsonLd} invalid`,
      recommendation: "Consider relevant structured data and validate its contents.",
    },
  ];

  // Fetch robots.txt separately; failure is reported as unknown.
  let robotsTxt: "available" | "missing-or-unavailable" = "missing-or-unavailable";

  try {
    const robotsUrl = new URL("/robots.txt", finalUrl);
    const robotsResponse = await fetch(robotsUrl, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": "BulkSEOReporter/1.0" },
    });

    if (robotsResponse.ok) robotsTxt = "available";
  } catch {
    // The robots.txt check could not complete.
  }

  const issues = checks
    .filter((check) => !check.passed)
    .map((check) => ({
      name: check.name,
      details: check.details,
      recommendation: check.recommendation,
    }));

  const passedChecks = checks.filter((check) => check.passed).length;

  return {
    url: finalUrl.href,
    statusCode: response.status,
    scannedAt: new Date().toISOString(),

    page: {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description.length,
      language: $("html").attr("lang") || null,
      wordCount,
    },

    headings,
    canonical,
    robots: {
      meta: robotsMeta || null,
      googlebot: googlebotMeta || null,
      header: robotsHeader || null,
      indexableByDirectives: !/\bnoindex\b/.test(indexDirectives),
      robotsTxt,
    },

    links: {
      total: links.length,
      internal: internalLinks.length,
      external: externalLinks.length,
      nofollow: nofollowLinks,
      internalUrls: [...new Set(internalLinks)],
      externalUrls: [...new Set(externalLinks)],
    },

    images: {
      total: images.length,
      withoutAlt: imagesWithoutAlt,
      withoutDimensions: imagesWithoutDimensions,
    },

    structuredData: {
      jsonLdScripts: jsonLdScripts.length,
      validJsonLd,
      invalidJsonLd,
    },

    social: {
      openGraphTitle: $('meta[property="og:title"]').attr("content") || null,
      openGraphDescription:
        $('meta[property="og:description"]').attr("content") || null,
      openGraphImage: $('meta[property="og:image"]').attr("content") || null,
      twitterCard: $('meta[name="twitter:card"]').attr("content") || null,
    },

    summary: {
      totalChecks: checks.length,
      passedChecks,
      failedChecks: checks.length - passedChecks,
      score: Math.round((passedChecks / checks.length) * 100),
      issues,
    },
  };
}

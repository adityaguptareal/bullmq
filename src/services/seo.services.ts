
import * as cheerio from "cheerio";

const USER_AGENT = "BulkSEOReporter/1.0";

export async function scanWebsite(inputUrl: string) {
  const url = new URL(
    /^https?:\/\//i.test(inputUrl) ? inputUrl : `https://${inputUrl}`
  );

  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Only HTTP and HTTPS URLs are supported");
  }

  const response = await fetch(url, {
    signal: AbortSignal.timeout(15000),
    headers: { "User-Agent": USER_AGENT },
    redirect: "follow",
  });

  if (!response.ok) {
    throw new Error(`Website returned HTTP ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (!contentType.includes("text/html")) {
    throw new Error("The URL did not return an HTML page");
  }

  const html = await response.text();
  const finalUrl = response.url || url.href;
  const $ = cheerio.load(html);

  const findings: {
    category: string;
    severity: "high" | "medium" | "low";
    issue: string;
    evidence: string;
    impact: string;
    recommendation: string;
  }[] = [];

  // 1. Page title
  const title = $("title").first().text().trim();

  if (!title) {
    findings.push({
      category: "SEO",
      severity: "high",
      issue: "Page title is missing",
      evidence: "No non-empty <title> element was found.",
      impact: "Search engines and users have less information about this page's topic.",
      recommendation: "Add a unique, descriptive title that reflects the page's main topic.",
    });
  } else if (title.length > 60) {
    findings.push({
      category: "SEO",
      severity: "low",
      issue: "Page title may be too long",
      evidence: `${title.length} characters: "${title}"`,
      impact: "The title may be truncated in some search results.",
      recommendation: "Review the wording and put the most important information first.",
    });
  }

  // 2. Meta description
  const description =
    $('meta[name="description"]').attr("content")?.trim() ?? "";

  if (!description) {
    findings.push({
      category: "SEO",
      severity: "medium",
      issue: "Meta description is missing",
      evidence: "No non-empty meta description was found.",
      impact: "The page has no explicit description to suggest to search engines for its search snippet.",
      recommendation: "Write a unique summary that communicates the page's value and encourages relevant visitors to click.",
    });
  } else if (description.length > 160) {
    findings.push({
      category: "SEO",
      severity: "low",
      issue: "Meta description may be lengthy",
      evidence: `${description.length} characters`,
      impact: "Search engines may choose to truncate or rewrite the snippet.",
      recommendation: "Review whether the key message can be communicated more concisely.",
    });
  }

  // 3. Headings
  const h1Headings = $("h1")
    .map((_, el) => $(el).text().replace(/\s+/g, " ").trim())
    .get()
    .filter(Boolean);

  const contentHeadings = $("h2, h3, h4")
    .map((_, el) => ({
      level: el.tagName.toLowerCase(),
      text: $(el).text().replace(/\s+/g, " ").trim(),
    }))
    .get()
    .filter((heading) => heading.text.length > 0);

  if (h1Headings.length === 0) {
    findings.push({
      category: "Content",
      severity: "medium",
      issue: "Main heading is missing",
      evidence: "No non-empty H1 heading was found.",
      impact: "Visitors may have a harder time identifying the page's primary topic and purpose.",
      recommendation: "Add a clear main heading that describes the page's primary subject.",
    });
  } else if (h1Headings.length > 1) {
    findings.push({
      category: "Content",
      severity: "low",
      issue: "Multiple main headings found",
      evidence: h1Headings.join(" | "),
      impact: "Reviewing the heading hierarchy may improve clarity and consistency.",
      recommendation: "Check whether one clear primary heading would better represent the page.",
    });
  }

  // 4. Images missing alt attributes
  const images = $("img")
    .map((_, el) => {
      const image = $(el);
      const src =
        image.attr("src") ||
        image.attr("data-src") ||
        image.attr("data-lazy-src") ||
        "";

      let imageUrl: string | null = null;

      try {
        imageUrl = src ? new URL(src, finalUrl).href : null;
      } catch {
        // Keep an unresolved image URL as null.
      }

      return {
        imageUrl,
        alt: image.attr("alt") ?? null,
        missingAlt: image.attr("alt") === undefined,
      };
    })
    .get();

  const imagesMissingAlt = images.filter((image) => image.missingAlt);

  if (imagesMissingAlt.length > 0) {
    findings.push({
      category: "Accessibility",
      severity: "medium",
      issue: "Images are missing alt attributes",
      evidence: `${imagesMissingAlt.length} of ${images.length} images have no alt attribute.`,
      impact: "Meaningful images without alternative text may be inaccessible to screen-reader users and lose useful image context.",
      recommendation: "Review the listed images and add descriptive alt text to meaningful images. Keep decorative images appropriately marked.",
    });
  }

  // 5. Indexing directives
  const robotsMeta = $('meta[name="robots"]').attr("content") ?? "";
  const googlebotMeta = $('meta[name="googlebot"]').attr("content") ?? "";
  const robotsHeader = response.headers.get("x-robots-tag") ?? "";

  const directives = [robotsMeta, googlebotMeta, robotsHeader]
    .join(" ")
    .toLowerCase();

  if (/\bnoindex\b/.test(directives)) {
    findings.push({
      category: "Technical SEO",
      severity: "high",
      issue: "A noindex directive was detected",
      evidence: [robotsMeta, googlebotMeta, robotsHeader]
        .filter(Boolean)
        .join(" | "),
      impact: "Search engines instructed to follow this directive may exclude the page from search results.",
      recommendation: "Confirm that the directive is intentional. Remove it only if the page should be indexed.",
    });
  }

  // 6. Canonical URL
  const canonicalRaw = $('link[rel="canonical"]').attr("href");

  let canonical: string | null = null;

  try {
    canonical = canonicalRaw
      ? new URL(canonicalRaw, finalUrl).href
      : null;
  } catch {
    // Invalid canonical URL.
  }

  if (!canonicalRaw || !canonical) {
    findings.push({
      category: "Technical SEO",
      severity: "low",
      issue: "Canonical URL is missing or invalid",
      evidence: canonicalRaw || "No valid canonical URL found.",
      impact: "The preferred URL version is not explicitly declared by this tag.",
      recommendation: "Review whether a canonical URL is appropriate for this page, especially if duplicate URL versions exist.",
    });
  }

  // 7. Mobile viewport
  if (!$('meta[name="viewport"]').length) {
    findings.push({
      category: "Mobile experience",
      severity: "medium",
      issue: "Mobile viewport metadata is missing",
      evidence: "No viewport meta tag was found.",
      impact: "Mobile browsers may render the page using a desktop-style viewport.",
      recommendation: "Add an appropriate viewport meta tag and test the page on mobile screens.",
    });
  }

  // 8. Internal and external links
  let internalLinks = 0;
  let externalLinks = 0;

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");

    if (!href) return;

    try {
      const linkUrl = new URL(href, finalUrl);

      if (!["http:", "https:"].includes(linkUrl.protocol)) return;

      if (linkUrl.hostname === new URL(finalUrl).hostname) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } catch {
      // Ignore invalid links.
    }
  });

  // 9. Social preview
  const openGraphTitle =
    $('meta[property="og:title"]').attr("content")?.trim() ?? "";

  if (!openGraphTitle) {
    findings.push({
      category: "Social sharing",
      severity: "low",
      issue: "Open Graph title is missing",
      evidence: "No non-empty og:title was found.",
      impact: "Social platforms may have less guidance for the title shown in link previews.",
      recommendation: "Add an Open Graph title that accurately represents the page.",
    });
  }

  // 10. Summary
  const summary = {
    totalFindings: findings.length,
    high: findings.filter((f) => f.severity === "high").length,
    medium: findings.filter((f) => f.severity === "medium").length,
    low: findings.filter((f) => f.severity === "low").length,
  };

  return {
    url: finalUrl,
    scannedAt: new Date().toISOString(),

    overview: {
      title: $("title").first().text().trim(),
      description,
      h1: h1Headings,
      headings: contentHeadings,
      totalImages: images.length,
      imagesMissingAlt,
      internalLinks,
      externalLinks,
    },

    findings,
    summary,
  };
}

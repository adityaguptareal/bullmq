import lighthouse from "lighthouse";
import * as chromeLauncher from "chrome-launcher";

type CategoryKey =
  | "performance"
  | "seo"
  | "accessibility"
  | "best-practices";

type MetricId =
  | "first-contentful-paint"
  | "largest-contentful-paint"
  | "speed-index"
  | "total-blocking-time"
  | "cumulative-layout-shift";

interface PerformanceScore {
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
}

interface PerformanceMetric {
  value: string;
  numericValue: number | null;
}

type PerformanceMetrics = Record<MetricId, PerformanceMetric>;

interface PerformanceOpportunity {
  title: string;
  description: string;
  estimatedSavings: string | null;
}

export interface PerformanceAuditResult {
  url: string;
  strategy: "mobile";
  scores: PerformanceScore;
  metrics: PerformanceMetrics;
  opportunities: PerformanceOpportunity[];
}

export async function scanPerformance(
  url: string
): Promise<PerformanceAuditResult> {
  let chrome: Awaited<
    ReturnType<typeof chromeLauncher.launch>
  > | undefined;

  try {
    chrome = await chromeLauncher.launch({
      chromeFlags: ["--headless", "--disable-gpu"],
    });

    const result = await lighthouse(url, {
      logLevel: "error",
      output: "json",
      onlyCategories: [
        "performance",
        "seo",
        "accessibility",
        "best-practices",
      ],
      port: chrome.port,
    });

    if (!result) {
      throw new Error("Lighthouse did not return a report");
    }

    const report = result.lhr;
    const categories = report.categories;
    const audits = report.audits;

    const getScore = (category: CategoryKey): number | null => {
      const score = categories[category]?.score;

      return score == null ? null : Math.round(score * 100);
    };

    const metricIds: MetricId[] = [
      "first-contentful-paint",
      "largest-contentful-paint",
      "speed-index",
      "total-blocking-time",
      "cumulative-layout-shift",
    ];

    const performanceMetrics = Object.fromEntries(
      metricIds.map((id) => {
        const audit = audits[id];

        return [
          id,
          {
            value: audit?.displayValue ?? "Unavailable",
            numericValue: audit?.numericValue ?? null,
          },
        ];
      })
    ) as PerformanceMetrics;

    const performanceCategory = categories.performance;

    if (!performanceCategory) {
      throw new Error("Lighthouse performance category is missing");
    }

    const opportunities: PerformanceOpportunity[] =
      performanceCategory.auditRefs
        .filter((ref) => ref.weight > 0)
        .map((ref) => audits[ref.id])
        .filter(
          (audit): audit is NonNullable<typeof audit> =>
            audit !== undefined &&
            audit.score !== null &&
            audit.score < 0.9 &&
            audit.details?.type === "opportunity"
        )
        .slice(0, 5)
        .map((audit) => ({
          title: audit.title,
          description: audit.description,
          estimatedSavings: audit.displayValue ?? null,
        }));

    return {
      url: report.finalDisplayedUrl,
      strategy: "mobile",
      scores: {
        performance: getScore("performance"),
        seo: getScore("seo"),
        accessibility: getScore("accessibility"),
        bestPractices: getScore("best-practices"),
      },
      metrics: performanceMetrics,
      opportunities,
    };
  } finally {
    if (chrome) {
      await chrome.kill();
    }
  }
}
const durationBuckets = [0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];

interface HttpMetric {
    count: number;
    durationSum: number;
    buckets: number[];
}

const httpMetrics = new Map<string, HttpMetric>();

const escapeLabel = (value: string): string => value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n");

const labels = (method: string, route: string, status: number): string => (
    `method="${escapeLabel(method)}",route="${escapeLabel(route)}",status="${status}"`
);

export const normalizeMetricRoute = (path: string): string => path
    .replace(
        /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
        ":id",
    )
    .replace(/\b[A-Za-z0-9_-]{48,}\b/g, ":token")
    .slice(0, 200);

export class MetricsService {
    recordHttp(method: string, route: string, status: number, durationSeconds: number): void {
        const key = JSON.stringify([method, route, status]);
        const metric = httpMetrics.get(key) ?? {
            count: 0,
            durationSum: 0,
            buckets: durationBuckets.map(() => 0),
        };
        metric.count += 1;
        metric.durationSum += durationSeconds;
        durationBuckets.forEach((bucket, index) => {
            if (durationSeconds <= bucket) metric.buckets[index] += 1;
        });
        httpMetrics.set(key, metric);
    }

    render(): string {
        const lines = [
            "# HELP rhumi_http_requests_total Total de requisições HTTP.",
            "# TYPE rhumi_http_requests_total counter",
        ];
        for (const [key, metric] of httpMetrics) {
            const [method, route, status] = JSON.parse(key) as [string, string, number];
            const baseLabels = labels(method, route, status);
            lines.push(`rhumi_http_requests_total{${baseLabels}} ${metric.count}`);
        }
        lines.push(
            "# HELP rhumi_http_request_duration_seconds Duração das requisições HTTP.",
            "# TYPE rhumi_http_request_duration_seconds histogram",
        );
        for (const [key, metric] of httpMetrics) {
            const [method, route, status] = JSON.parse(key) as [string, string, number];
            const baseLabels = labels(method, route, status);
            durationBuckets.forEach((bucket, index) => {
                lines.push(
                    `rhumi_http_request_duration_seconds_bucket{${baseLabels},le="${bucket}"} ${metric.buckets[index]}`,
                );
            });
            lines.push(
                `rhumi_http_request_duration_seconds_bucket{${baseLabels},le="+Inf"} ${metric.count}`,
                `rhumi_http_request_duration_seconds_sum{${baseLabels}} ${metric.durationSum}`,
                `rhumi_http_request_duration_seconds_count{${baseLabels}} ${metric.count}`,
            );
        }
        lines.push(
            "# HELP process_uptime_seconds Tempo de execução do processo.",
            "# TYPE process_uptime_seconds gauge",
            `process_uptime_seconds ${process.uptime()}`,
            "# HELP process_resident_memory_bytes Memória residente do processo.",
            "# TYPE process_resident_memory_bytes gauge",
            `process_resident_memory_bytes ${process.memoryUsage().rss}`,
        );
        return `${lines.join("\n")}\n`;
    }
}

export const metricsService = new MetricsService();

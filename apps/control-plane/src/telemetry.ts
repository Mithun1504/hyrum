import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";

let sdk: NodeSDK | undefined;

export function startTelemetry(endpoint: string | undefined) {
  if (!endpoint || sdk) return;
  const base = endpoint.replace(/\/$/, "");
  sdk = new NodeSDK({
    serviceName: "hyrum-control-plane",
    traceExporter: new OTLPTraceExporter({ url: `${base}/v1/traces` }),
    metricReader: new PeriodicExportingMetricReader({
      exporter: new OTLPMetricExporter({ url: `${base}/v1/metrics` }),
      exportIntervalMillis: 15_000,
    }),
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-fs": { enabled: false },
      }),
    ],
  });
  sdk.start();
}

export async function stopTelemetry() {
  await sdk?.shutdown();
  sdk = undefined;
}

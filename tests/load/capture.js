import { check, sleep } from "k6";
import http from "k6/http";
import { Rate, Trend } from "k6/metrics";

const errors = new Rate("hyrum_capture_errors");
const latency = new Trend("hyrum_capture_latency", true);

export const options = {
  scenarios: {
    steady_capture: {
      executor: "constant-arrival-rate",
      rate: Number(__ENV.HYRUM_K6_RATE || 20),
      timeUnit: "1s",
      duration: __ENV.HYRUM_K6_DURATION || "2m",
      preAllocatedVUs: 10,
      maxVUs: 100,
    },
  },
  thresholds: {
    hyrum_capture_errors: ["rate<0.01"],
    hyrum_capture_latency: ["p(95)<1000"],
  },
};

const baseUrl = __ENV.HYRUM_CONTROL_PLANE_URL;
const token = __ENV.HYRUM_MACHINE_TOKEN;
const template = JSON.parse(open(__ENV.HYRUM_CAPTURE_TEMPLATE || "./capture-template.json"));

export default function () {
  const batch = structuredClone(template);
  batch.batch_id = `k6-${__VU}-${__ITER}-${Date.now()}`;
  for (const event of batch.events) event.event_id = `${event.event_id}-${__VU}-${__ITER}`;
  const response = http.post(`${baseUrl}/v1/capture/batches`, JSON.stringify(batch), {
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    timeout: "5s",
  });
  latency.add(response.timings.duration);
  const ok = check(response, { "capture accepted": (value) => value.status === 200 });
  errors.add(!ok);
  sleep(0.05);
}

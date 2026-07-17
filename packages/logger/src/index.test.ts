import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";
import { createLogger } from "./index";

describe("safe structured logging", () => {
  it("redacts sensitive fields and never serializes error response bodies", () => {
    let output = "";
    const destination = new Writable({
      write(chunk, _encoding, callback) {
        output += chunk.toString();
        callback();
      },
    });
    const logger = createLogger("test", "info", { base: null }, destination);
    const error = Object.assign(new Error("request failed"), {
      response: { body: "raw-private-traffic" },
    });
    logger.error({ err: error, token: "secret-token", body: "request-body" }, "failed");
    expect(output).not.toContain("raw-private-traffic");
    expect(output).not.toContain("secret-token");
    expect(output).not.toContain("request-body");
    expect(output).toContain("request failed");
  });
});

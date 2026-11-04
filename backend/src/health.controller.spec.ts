import { HealthController } from "./health.controller";

describe("HealthController", () => {
  it("returns a healthy status", () => {
    expect(new HealthController().check()).toEqual({ status: "ok" });
  });
});

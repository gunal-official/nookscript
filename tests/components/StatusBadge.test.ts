import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), "utf8");

describe("StatusBadges", () => {
  it("plan badge maps machine statuses to human labels", () => {
    const src = read("components/plans/PlanStatusBadge.tsx");
    for (const label of ["Not started", "In progress", "Done"]) {
      assert.ok(src.includes(label));
    }
    assert.ok(src.includes("STATUS_STYLES"));
  });

  it("invoice and contract badges follow the same pattern", () => {
    assert.ok(read("components/invoices/InvoiceStatusBadge.tsx").includes("STATUS_STYLES"));
    assert.ok(read("components/contracts/ContractStatusBadge.tsx").includes("STATUS_STYLES"));
    assert.ok(read("components/briefs/StatusBadge.tsx").includes("STATUS_STYLES"));
  });
});

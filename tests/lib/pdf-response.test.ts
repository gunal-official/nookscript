/**
 * Unit tests for lib/pdf/response.ts — the HTTP contract of both PDF routes
 * (PDF export). Headers are the whole feature here: get the disposition
 * wrong and the browser renders bytes into the tab instead of saving a
 * file; forget no-store and a shared invoice ends up in a CDN.
 */

import { describe, test } from "node:test";
import assert from "node:assert/strict";

import { pdfResponse, requestedPageSize } from "../../lib/pdf/response.ts";

const result = {
  bytes: new Uint8Array([37, 80, 68, 70]), // "%PDF"
  filename: "INV-0002-aurora-labs.pdf",
};

describe("requestedPageSize", () => {
  const request = (url: string) => new Request(url);

  test("defaults to A4 (the product is global)", () => {
    assert.equal(requestedPageSize(request("https://x.test/api/pdf/invoice/1")), "a4");
  });

  test("?size=letter switches to US Letter", () => {
    assert.equal(
      requestedPageSize(request("https://x.test/api/pdf/invoice/1?size=letter")),
      "letter"
    );
  });

  test("an unknown size falls back to A4 instead of erroring", () => {
    assert.equal(
      requestedPageSize(request("https://x.test/api/pdf/invoice/1?size=a0")),
      "a4"
    );
    assert.equal(
      requestedPageSize(request("https://x.test/api/pdf/invoice/1?size=__proto__")),
      "a4"
    );
  });
});

describe("pdfResponse", () => {
  test("serves a downloadable PDF with the generated filename", async () => {
    const response = pdfResponse(result);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("content-type"), "application/pdf");
    assert.equal(response.headers.get("content-length"), "4");
    assert.equal(
      response.headers.get("content-disposition"),
      'attachment; filename="INV-0002-aurora-labs.pdf"; ' +
        "filename*=UTF-8''INV-0002-aurora-labs.pdf"
    );
    assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
    assert.equal(response.headers.get("x-content-type-options"), "nosniff");
    assert.deepEqual(
      Array.from(new Uint8Array(await response.arrayBuffer())),
      [37, 80, 68, 70]
    );
  });

  test("a quote in a filename cannot break out of the header", () => {
    const response = pdfResponse({
      ...result,
      filename: 'inv"; attachment; filename="evil.pdf',
    });
    const disposition = response.headers.get("content-disposition") ?? "";
    assert.ok(!disposition.includes('"; attachment; filename="evil'));
    assert.match(disposition, /^attachment; filename="inv; attachment; filename=evil\.pdf"/);
  });
});

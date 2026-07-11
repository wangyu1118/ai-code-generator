import test from "node:test";
import assert from "node:assert/strict";

import app from "../server/index.js";

test("server module exports the Express app for serverless runtimes", () => {
  assert.equal(typeof app, "function");
  assert.equal(typeof app.handle, "function");
});

test("POST /api/generate returns JSON 400 when the request body is missing", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const address = server.address();
  const response = await fetch(`http://127.0.0.1:${address.port}/api/generate`, {
    method: "POST"
  });
  const payload = await response.json();

  assert.equal(response.status, 400);
  assert.equal(typeof payload.error, "string");
});

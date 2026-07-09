import test from "node:test";
import assert from "node:assert/strict";

import app from "../server/index.js";

test("server module exports the Express app for serverless runtimes", () => {
  assert.equal(typeof app, "function");
  assert.equal(typeof app.handle, "function");
});

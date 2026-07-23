// Preloaded via `node --require` during the build so the File/Blob globals
// exist in EVERY process (including Next's page-data collection workers) before
// any app module is evaluated. Fixes "ReferenceError: File is not defined" on
// Node runtimes where these Web globals aren't present by default (Railway).
const { File, Blob } = require("node:buffer");
if (typeof globalThis.File === "undefined") globalThis.File = File;
if (typeof globalThis.Blob === "undefined") globalThis.Blob = Blob;

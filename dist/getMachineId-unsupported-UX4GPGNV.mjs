import {
  diag
} from "./chunk-SWUHJDYO.mjs";

// node_modules/@opentelemetry/resources/build/esm/detectors/platform/node/machine-id/getMachineId-unsupported.js
async function getMachineId() {
  diag.debug("could not read machine-id: unsupported platform");
  return void 0;
}
export {
  getMachineId
};

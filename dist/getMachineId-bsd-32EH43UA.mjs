import {
  execAsync
} from "./chunk-RUJDJCWT.mjs";
import {
  diag
} from "./chunk-SWUHJDYO.mjs";

// node_modules/@opentelemetry/resources/build/esm/detectors/platform/node/machine-id/getMachineId-bsd.js
import { promises as fs } from "fs";
async function getMachineId() {
  try {
    const result = await fs.readFile("/etc/hostid", { encoding: "utf8" });
    return result.trim();
  } catch (e) {
    diag.debug(`error reading machine id: ${e}`);
  }
  try {
    const result = await execAsync("kenv -q smbios.system.uuid");
    return result.stdout.trim();
  } catch (e) {
    diag.debug(`error reading machine id: ${e}`);
  }
  return void 0;
}
export {
  getMachineId
};

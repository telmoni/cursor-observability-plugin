import {
  diag
} from "./chunk-SWUHJDYO.mjs";

// node_modules/@opentelemetry/resources/build/esm/detectors/platform/node/machine-id/getMachineId-linux.js
import { promises as fs } from "fs";
async function getMachineId() {
  const paths = ["/etc/machine-id", "/var/lib/dbus/machine-id"];
  for (const path of paths) {
    try {
      const result = await fs.readFile(path, { encoding: "utf8" });
      return result.trim();
    } catch (e) {
      diag.debug(`error reading machine id: ${e}`);
    }
  }
  return void 0;
}
export {
  getMachineId
};

// node_modules/@opentelemetry/resources/build/esm/detectors/platform/node/machine-id/execAsync.js
import * as child_process from "child_process";
import * as util from "util";
var execAsync = util.promisify(child_process.exec);

export {
  execAsync
};

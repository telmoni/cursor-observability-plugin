import {
  INVALID_SPAN_CONTEXT,
  ROOT_CONTEXT,
  SamplingDecision,
  SpanKind,
  SpanStatusCode,
  TraceFlags,
  context,
  createContextKey,
  createNoopMeter,
  diag,
  isSpanContextValid,
  isValidTraceId,
  trace
} from "./chunk-SWUHJDYO.mjs";

// node_modules/telmoni/dist/index.mjs
import { BlockList, isIPv4, isIPv6 } from "net";

// node_modules/@opentelemetry/core/build/esm/trace/suppress-tracing.js
var SUPPRESS_TRACING_KEY = createContextKey("OpenTelemetry SDK Context Key SUPPRESS_TRACING");
function isTracingSuppressed(context2) {
  return context2.getValue(SUPPRESS_TRACING_KEY) === true;
}

// node_modules/@opentelemetry/core/build/esm/common/attributes.js
function sanitizeAttributes(attributes) {
  const out = {};
  if (typeof attributes !== "object" || attributes == null) {
    return out;
  }
  for (const key in attributes) {
    if (!Object.prototype.hasOwnProperty.call(attributes, key)) {
      continue;
    }
    if (!isAttributeKey(key)) {
      diag.warn(`Invalid attribute key: ${key}`);
      continue;
    }
    const val = attributes[key];
    if (!isAttributeValue(val)) {
      diag.warn(`Invalid attribute value set for key: ${key}`);
      continue;
    }
    if (Array.isArray(val)) {
      out[key] = val.slice();
    } else {
      out[key] = val;
    }
  }
  return out;
}
function isAttributeKey(key) {
  return typeof key === "string" && key !== "";
}
function isAttributeValue(val) {
  if (val == null) {
    return true;
  }
  if (Array.isArray(val)) {
    return isHomogeneousAttributeValueArray(val);
  }
  return isValidPrimitiveAttributeValueType(typeof val);
}
function isHomogeneousAttributeValueArray(arr) {
  let type;
  for (const element of arr) {
    if (element == null)
      continue;
    const elementType = typeof element;
    if (elementType === type) {
      continue;
    }
    if (!type) {
      if (isValidPrimitiveAttributeValueType(elementType)) {
        type = elementType;
        continue;
      }
      return false;
    }
    return false;
  }
  return true;
}
function isValidPrimitiveAttributeValueType(valType) {
  switch (valType) {
    case "number":
    case "boolean":
    case "string":
      return true;
  }
  return false;
}

// node_modules/@opentelemetry/core/build/esm/common/logging-error-handler.js
function loggingErrorHandler() {
  return (ex) => {
    diag.error(stringifyException(ex));
  };
}
function stringifyException(ex) {
  if (typeof ex === "string") {
    return ex;
  } else {
    return JSON.stringify(flattenException(ex));
  }
}
function flattenException(ex) {
  const result = {};
  let current = ex;
  while (current !== null) {
    Object.getOwnPropertyNames(current).forEach((propertyName) => {
      if (result[propertyName])
        return;
      const value = current[propertyName];
      if (value) {
        result[propertyName] = String(value);
      }
    });
    current = Object.getPrototypeOf(current);
  }
  return result;
}

// node_modules/@opentelemetry/core/build/esm/common/global-error-handler.js
var delegateHandler = loggingErrorHandler();
function globalErrorHandler(ex) {
  try {
    delegateHandler(ex);
  } catch {
  }
}

// node_modules/@opentelemetry/core/build/esm/platform/node/environment.js
import { inspect } from "util";
function getNumberFromEnv(key) {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") {
    return void 0;
  }
  const value = Number(raw);
  if (isNaN(value)) {
    diag.warn(`Unknown value ${inspect(raw)} for ${key}, expected a number, using defaults`);
    return void 0;
  }
  return value;
}
function getStringFromEnv(key) {
  const raw = process.env[key];
  if (raw == null || raw.trim() === "") {
    return void 0;
  }
  return raw;
}

// node_modules/@opentelemetry/core/build/esm/version.js
var VERSION = "2.12.0";

// node_modules/@opentelemetry/semantic-conventions/build/esm/stable_attributes.js
var ATTR_EXCEPTION_MESSAGE = "exception.message";
var ATTR_EXCEPTION_STACKTRACE = "exception.stacktrace";
var ATTR_EXCEPTION_TYPE = "exception.type";
var ATTR_SERVICE_NAME = "service.name";
var ATTR_TELEMETRY_SDK_LANGUAGE = "telemetry.sdk.language";
var TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS = "nodejs";
var ATTR_TELEMETRY_SDK_NAME = "telemetry.sdk.name";
var ATTR_TELEMETRY_SDK_VERSION = "telemetry.sdk.version";

// node_modules/@opentelemetry/core/build/esm/semconv.js
var ATTR_PROCESS_RUNTIME_NAME = "process.runtime.name";

// node_modules/@opentelemetry/core/build/esm/platform/node/sdk-info.js
var SDK_INFO = {
  [ATTR_TELEMETRY_SDK_NAME]: "opentelemetry",
  [ATTR_PROCESS_RUNTIME_NAME]: "node",
  [ATTR_TELEMETRY_SDK_LANGUAGE]: TELEMETRY_SDK_LANGUAGE_VALUE_NODEJS,
  [ATTR_TELEMETRY_SDK_VERSION]: VERSION
};

// node_modules/@opentelemetry/core/build/esm/platform/node/index.js
var otperformance = performance;

// node_modules/@opentelemetry/core/build/esm/common/time.js
var NANOSECOND_DIGITS = 9;
var NANOSECOND_DIGITS_IN_MILLIS = 6;
var MILLISECONDS_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS_IN_MILLIS);
var SECOND_TO_NANOSECONDS = Math.pow(10, NANOSECOND_DIGITS);
function millisToHrTime(epochMillis) {
  const epochSeconds = epochMillis / 1e3;
  const seconds = Math.trunc(epochSeconds);
  const nanos2 = Math.round(epochMillis % 1e3 * MILLISECONDS_TO_NANOSECONDS);
  return [seconds, nanos2];
}
function hrTime(performanceNow) {
  const timeOrigin = millisToHrTime(otperformance.timeOrigin);
  const now = millisToHrTime(typeof performanceNow === "number" ? performanceNow : otperformance.now());
  return addHrTimes(timeOrigin, now);
}
function hrTimeDuration(startTime, endTime) {
  let seconds = endTime[0] - startTime[0];
  let nanos2 = endTime[1] - startTime[1];
  if (nanos2 < 0) {
    seconds -= 1;
    nanos2 += SECOND_TO_NANOSECONDS;
  }
  return [seconds, nanos2];
}
function isTimeInputHrTime(value) {
  return Array.isArray(value) && value.length === 2 && typeof value[0] === "number" && typeof value[1] === "number";
}
function isTimeInput(value) {
  return isTimeInputHrTime(value) || typeof value === "number" || value instanceof Date;
}
function addHrTimes(time1, time2) {
  const out = [time1[0] + time2[0], time1[1] + time2[1]];
  if (out[1] >= SECOND_TO_NANOSECONDS) {
    out[1] -= SECOND_TO_NANOSECONDS;
    out[0] += 1;
  }
  return out;
}

// node_modules/@opentelemetry/core/build/esm/utils/lodash.merge.js
var objectTag = "[object Object]";
var nullTag = "[object Null]";
var undefinedTag = "[object Undefined]";
var funcProto = Function.prototype;
var funcToString = funcProto.toString;
var objectCtorString = funcToString.call(Object);
var getPrototypeOf = Object.getPrototypeOf;
var objectProto = Object.prototype;
var hasOwnProperty = objectProto.hasOwnProperty;
var symToStringTag = Symbol ? Symbol.toStringTag : void 0;
var nativeObjectToString = objectProto.toString;
function isPlainObject(value) {
  if (!isObjectLike(value) || baseGetTag(value) !== objectTag) {
    return false;
  }
  const proto = getPrototypeOf(value);
  if (proto === null) {
    return true;
  }
  const Ctor = hasOwnProperty.call(proto, "constructor") && proto.constructor;
  return typeof Ctor == "function" && Ctor instanceof Ctor && funcToString.call(Ctor) === objectCtorString;
}
function isObjectLike(value) {
  return value != null && typeof value == "object";
}
function baseGetTag(value) {
  if (value == null) {
    return value === void 0 ? undefinedTag : nullTag;
  }
  return symToStringTag && symToStringTag in Object(value) ? getRawTag(value) : objectToString(value);
}
function getRawTag(value) {
  const isOwn = hasOwnProperty.call(value, symToStringTag), tag = value[symToStringTag];
  let unmasked = false;
  try {
    value[symToStringTag] = void 0;
    unmasked = true;
  } catch {
  }
  const result = nativeObjectToString.call(value);
  if (unmasked) {
    if (isOwn) {
      value[symToStringTag] = tag;
    } else {
      delete value[symToStringTag];
    }
  }
  return result;
}
function objectToString(value) {
  return nativeObjectToString.call(value);
}

// node_modules/@opentelemetry/core/build/esm/utils/merge.js
var MAX_LEVEL = 20;
function merge(...args) {
  let result = args.shift();
  const objects = /* @__PURE__ */ new WeakMap();
  while (args.length > 0) {
    result = mergeTwoObjects(result, args.shift(), 0, objects);
  }
  return result;
}
function takeValue(value) {
  if (isArray(value)) {
    return value.slice();
  }
  return value;
}
function mergeTwoObjects(one, two, level = 0, objects) {
  let result;
  if (level > MAX_LEVEL) {
    return void 0;
  }
  level++;
  if (isPrimitive(one) || isPrimitive(two) || isFunction(two)) {
    result = takeValue(two);
  } else if (isArray(one)) {
    result = one.slice();
    if (isArray(two)) {
      for (let i = 0, j = two.length; i < j; i++) {
        result.push(takeValue(two[i]));
      }
    } else if (isObject(two)) {
      const keys = Object.keys(two);
      for (let i = 0, j = keys.length; i < j; i++) {
        const key = keys[i];
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        result[key] = takeValue(two[key]);
      }
    }
  } else if (isObject(one)) {
    if (isObject(two)) {
      if (!shouldMerge(one, two)) {
        return two;
      }
      result = Object.assign({}, one);
      const keys = Object.keys(two);
      for (let i = 0, j = keys.length; i < j; i++) {
        const key = keys[i];
        if (key === "__proto__" || key === "constructor" || key === "prototype") {
          continue;
        }
        const twoValue = two[key];
        if (isPrimitive(twoValue)) {
          if (typeof twoValue === "undefined") {
            delete result[key];
          } else {
            result[key] = twoValue;
          }
        } else {
          const obj1 = result[key];
          const obj2 = twoValue;
          if (wasObjectReferenced(one, key, objects) || wasObjectReferenced(two, key, objects)) {
            delete result[key];
          } else {
            if (isObject(obj1) && isObject(obj2)) {
              const arr1 = objects.get(obj1) || [];
              const arr2 = objects.get(obj2) || [];
              arr1.push({ obj: one, key });
              arr2.push({ obj: two, key });
              objects.set(obj1, arr1);
              objects.set(obj2, arr2);
            }
            result[key] = mergeTwoObjects(result[key], twoValue, level, objects);
          }
        }
      }
    } else {
      result = two;
    }
  }
  return result;
}
function wasObjectReferenced(obj, key, objects) {
  const arr = objects.get(obj[key]) || [];
  for (let i = 0, j = arr.length; i < j; i++) {
    const info = arr[i];
    if (info.key === key && info.obj === obj) {
      return true;
    }
  }
  return false;
}
function isArray(value) {
  return Array.isArray(value);
}
function isFunction(value) {
  return typeof value === "function";
}
function isObject(value) {
  return !isPrimitive(value) && !isArray(value) && !isFunction(value) && typeof value === "object";
}
function isPrimitive(value) {
  return typeof value === "string" || typeof value === "number" || typeof value === "boolean" || typeof value === "undefined" || value instanceof Date || value instanceof RegExp || value === null;
}
function shouldMerge(one, two) {
  if (!isPlainObject(one) || !isPlainObject(two)) {
    return false;
  }
  return true;
}

// node_modules/@opentelemetry/resources/build/esm/default-service-name.js
var serviceName;
function defaultServiceName() {
  if (serviceName === void 0) {
    try {
      const argv0 = globalThis.process.argv0;
      serviceName = argv0 ? `unknown_service:${argv0}` : "unknown_service";
    } catch {
      serviceName = "unknown_service";
    }
  }
  return serviceName;
}

// node_modules/@opentelemetry/resources/build/esm/utils.js
var isPromiseLike = (val) => {
  return val !== null && typeof val === "object" && typeof val.then === "function";
};

// node_modules/@opentelemetry/resources/build/esm/ResourceImpl.js
var ResourceImpl = class _ResourceImpl {
  _rawAttributes;
  _asyncAttributesPending = false;
  _schemaUrl;
  _memoizedAttributes;
  static FromAttributeList(attributes, options) {
    const res = new _ResourceImpl({}, options);
    res._rawAttributes = guardedRawAttributes(attributes);
    res._asyncAttributesPending = attributes.filter(([_, val]) => isPromiseLike(val)).length > 0;
    return res;
  }
  constructor(resource, options) {
    const attributes = resource.attributes ?? {};
    this._rawAttributes = Object.entries(attributes).map(([k, v]) => {
      if (isPromiseLike(v)) {
        this._asyncAttributesPending = true;
      }
      return [k, v];
    });
    this._rawAttributes = guardedRawAttributes(this._rawAttributes);
    this._schemaUrl = validateSchemaUrl(options?.schemaUrl);
  }
  get asyncAttributesPending() {
    return this._asyncAttributesPending;
  }
  async waitForAsyncAttributes() {
    if (!this.asyncAttributesPending) {
      return;
    }
    for (let i = 0; i < this._rawAttributes.length; i++) {
      const [k, v] = this._rawAttributes[i];
      this._rawAttributes[i] = [k, isPromiseLike(v) ? await v : v];
    }
    this._asyncAttributesPending = false;
  }
  get attributes() {
    if (this.asyncAttributesPending) {
      diag.error("Accessing resource attributes before async attributes settled");
    }
    if (this._memoizedAttributes) {
      return this._memoizedAttributes;
    }
    const attrs = {};
    for (const [k, v] of this._rawAttributes) {
      if (isPromiseLike(v)) {
        diag.debug(`Unsettled resource attribute ${k} skipped`);
        continue;
      }
      if (v != null) {
        attrs[k] ??= v;
      }
    }
    if (!this._asyncAttributesPending) {
      this._memoizedAttributes = attrs;
    }
    return attrs;
  }
  getRawAttributes() {
    return this._rawAttributes;
  }
  get schemaUrl() {
    return this._schemaUrl;
  }
  merge(resource) {
    if (resource == null)
      return this;
    const mergedSchemaUrl = mergeSchemaUrl(this, resource);
    const mergedOptions = mergedSchemaUrl ? { schemaUrl: mergedSchemaUrl } : void 0;
    return _ResourceImpl.FromAttributeList([...resource.getRawAttributes(), ...this.getRawAttributes()], mergedOptions);
  }
};
function resourceFromAttributes(attributes, options) {
  return ResourceImpl.FromAttributeList(Object.entries(attributes), options);
}
function defaultResource() {
  return resourceFromAttributes({
    [ATTR_SERVICE_NAME]: defaultServiceName(),
    [ATTR_TELEMETRY_SDK_LANGUAGE]: SDK_INFO[ATTR_TELEMETRY_SDK_LANGUAGE],
    [ATTR_TELEMETRY_SDK_NAME]: SDK_INFO[ATTR_TELEMETRY_SDK_NAME],
    [ATTR_TELEMETRY_SDK_VERSION]: SDK_INFO[ATTR_TELEMETRY_SDK_VERSION]
  });
}
function guardedRawAttributes(attributes) {
  return attributes.map(([k, v]) => {
    if (isPromiseLike(v)) {
      return [
        k,
        v.catch((err) => {
          diag.debug("promise rejection for resource attribute: %s - %s", k, err);
          return void 0;
        })
      ];
    }
    return [k, v];
  });
}
function validateSchemaUrl(schemaUrl) {
  if (typeof schemaUrl === "string" || schemaUrl === void 0) {
    return schemaUrl;
  }
  diag.warn("Schema URL must be string or undefined, got %s. Schema URL will be ignored.", schemaUrl);
  return void 0;
}
function mergeSchemaUrl(old, updating) {
  const oldSchemaUrl = old?.schemaUrl;
  const updatingSchemaUrl = updating?.schemaUrl;
  const isOldEmpty = oldSchemaUrl === void 0 || oldSchemaUrl === "";
  const isUpdatingEmpty = updatingSchemaUrl === void 0 || updatingSchemaUrl === "";
  if (isOldEmpty) {
    return updatingSchemaUrl;
  }
  if (isUpdatingEmpty) {
    return oldSchemaUrl;
  }
  if (oldSchemaUrl === updatingSchemaUrl) {
    return oldSchemaUrl;
  }
  diag.warn('Schema URL merge conflict: old resource has "%s", updating resource has "%s". Resulting resource will have undefined Schema URL.', oldSchemaUrl, updatingSchemaUrl);
  return void 0;
}

// node_modules/@opentelemetry/sdk-trace/build/esm/enums.js
var ExceptionEventName = "exception";

// node_modules/@opentelemetry/sdk-trace/build/esm/inspect.js
var inspectCustom = /* @__PURE__ */ Symbol.for("nodejs.util.inspect.custom");
function settledResourceAttributes(resource) {
  const attrs = {};
  for (const [k, v] of resource.getRawAttributes()) {
    if (typeof v?.then === "function") {
      continue;
    }
    if (v != null) {
      attrs[k] ??= v;
    }
  }
  return attrs;
}
function formatInspect(className, payload, depth, options, inspect2) {
  if (typeof depth === "number" && depth < 0) {
    const tag = `[${className}]`;
    return options?.stylize ? options.stylize(tag, "special") : tag;
  }
  if (typeof inspect2 !== "function" || !options) {
    return payload;
  }
  const childOptions = {
    ...options,
    depth: options.depth == null ? options.depth : options.depth - 1
  };
  return `${className} ${inspect2(payload, childOptions)}`;
}

// node_modules/@opentelemetry/sdk-trace/build/esm/Span.js
var SpanImpl = class {
  // Below properties are included to implement ReadableSpan for export
  // purposes but are not intended to be written-to directly.
  _spanContext;
  kind;
  parentSpanContext;
  attributes = {};
  links = [];
  events = [];
  startTime;
  resource;
  instrumentationScope;
  _droppedAttributesCount = 0;
  _droppedEventsCount = 0;
  _droppedLinksCount = 0;
  _attributesCount = 0;
  name;
  status = {
    code: SpanStatusCode.UNSET
  };
  endTime = [0, 0];
  _ended = false;
  _duration = [-1, -1];
  _spanProcessor;
  _spanLimits;
  _attributeValueLengthLimit;
  _recordEndMetrics;
  _performanceStartTime;
  _performanceOffset;
  _startTimeProvided;
  /**
   * Constructs a new SpanImpl instance.
   */
  constructor(opts) {
    const now = Date.now();
    this._spanContext = opts.spanContext;
    this._performanceStartTime = otperformance.now();
    this._performanceOffset = now - (this._performanceStartTime + otperformance.timeOrigin);
    this._startTimeProvided = opts.startTime != null;
    this._spanLimits = opts.spanLimits;
    this._attributeValueLengthLimit = this._spanLimits.attributeValueLengthLimit ?? 0;
    this._spanProcessor = opts.spanProcessor;
    this.name = opts.name;
    this.parentSpanContext = opts.parentSpanContext;
    this.kind = opts.kind;
    if (opts.links) {
      for (const link of opts.links) {
        this.addLink(link);
      }
    }
    this.startTime = this._getTime(opts.startTime ?? now);
    this.resource = opts.resource;
    this.instrumentationScope = opts.scope;
    this._recordEndMetrics = opts.recordEndMetrics;
    if (opts.attributes != null) {
      this.setAttributes(opts.attributes);
    }
    this._spanProcessor.onStart(this, opts.context);
  }
  spanContext() {
    return this._spanContext;
  }
  setAttribute(key, value) {
    if (value == null || this._isSpanEnded())
      return this;
    if (key.length === 0) {
      diag.warn(`Invalid attribute key: ${key}`);
      return this;
    }
    if (!isAttributeValue(value)) {
      diag.warn(`Invalid attribute value set for key: ${key}`);
      return this;
    }
    const { attributeCountLimit } = this._spanLimits;
    const isNewKey = !Object.prototype.hasOwnProperty.call(this.attributes, key);
    if (attributeCountLimit !== void 0 && this._attributesCount >= attributeCountLimit && isNewKey) {
      this._droppedAttributesCount++;
      return this;
    }
    this.attributes[key] = this._truncateToSize(value);
    if (isNewKey) {
      this._attributesCount++;
    }
    return this;
  }
  setAttributes(attributes) {
    for (const key in attributes) {
      if (Object.prototype.hasOwnProperty.call(attributes, key)) {
        this.setAttribute(key, attributes[key]);
      }
    }
    return this;
  }
  /**
   *
   * @param name Span Name
   * @param [attributesOrStartTime] Span attributes or start time
   *     if type is {@type TimeInput} and 3rd param is undefined
   * @param [timeStamp] Specified time stamp for the event
   */
  addEvent(name, attributesOrStartTime, timeStamp) {
    if (this._isSpanEnded())
      return this;
    const { eventCountLimit } = this._spanLimits;
    if (eventCountLimit === 0) {
      diag.warn("No events allowed.");
      this._droppedEventsCount++;
      return this;
    }
    if (eventCountLimit !== void 0 && this.events.length >= eventCountLimit) {
      if (this._droppedEventsCount === 0) {
        diag.debug("Dropping extra events.");
      }
      this.events.shift();
      this._droppedEventsCount++;
    }
    if (isTimeInput(attributesOrStartTime)) {
      if (!isTimeInput(timeStamp)) {
        timeStamp = attributesOrStartTime;
      }
      attributesOrStartTime = void 0;
    }
    const sanitized = sanitizeAttributes(attributesOrStartTime);
    const { attributePerEventCountLimit } = this._spanLimits;
    const attributes = {};
    let droppedAttributesCount = 0;
    let eventAttributesCount = 0;
    for (const attr in sanitized) {
      if (!Object.prototype.hasOwnProperty.call(sanitized, attr)) {
        continue;
      }
      const attrVal = sanitized[attr];
      if (attributePerEventCountLimit !== void 0 && eventAttributesCount >= attributePerEventCountLimit) {
        droppedAttributesCount++;
        continue;
      }
      attributes[attr] = this._truncateToSize(attrVal);
      eventAttributesCount++;
    }
    this.events.push({
      name,
      attributes,
      time: this._getTime(timeStamp),
      droppedAttributesCount
    });
    return this;
  }
  addLink(link) {
    if (this._isSpanEnded())
      return this;
    const { linkCountLimit } = this._spanLimits;
    if (linkCountLimit === 0) {
      this._droppedLinksCount++;
      return this;
    }
    if (linkCountLimit !== void 0 && this.links.length >= linkCountLimit) {
      if (this._droppedLinksCount === 0) {
        diag.debug("Dropping extra links.");
      }
      this.links.shift();
      this._droppedLinksCount++;
    }
    const { attributePerLinkCountLimit } = this._spanLimits;
    const sanitized = sanitizeAttributes(link.attributes);
    const attributes = {};
    let droppedAttributesCount = 0;
    let linkAttributesCount = 0;
    for (const attr in sanitized) {
      if (!Object.prototype.hasOwnProperty.call(sanitized, attr)) {
        continue;
      }
      const attrVal = sanitized[attr];
      if (attributePerLinkCountLimit !== void 0 && linkAttributesCount >= attributePerLinkCountLimit) {
        droppedAttributesCount++;
        continue;
      }
      attributes[attr] = this._truncateToSize(attrVal);
      linkAttributesCount++;
    }
    const processedLink = { context: link.context };
    if (linkAttributesCount > 0) {
      processedLink.attributes = attributes;
    }
    if (droppedAttributesCount > 0) {
      processedLink.droppedAttributesCount = droppedAttributesCount;
    }
    this.links.push(processedLink);
    return this;
  }
  addLinks(links) {
    for (const link of links) {
      this.addLink(link);
    }
    return this;
  }
  setStatus(status) {
    if (this._isSpanEnded())
      return this;
    if (status.code === SpanStatusCode.UNSET)
      return this;
    if (this.status.code === SpanStatusCode.OK)
      return this;
    const newStatus = { code: status.code };
    if (status.code === SpanStatusCode.ERROR) {
      if (typeof status.message === "string") {
        newStatus.message = status.message;
      } else if (status.message != null) {
        diag.warn(`Dropping invalid status.message of type '${typeof status.message}', expected 'string'`);
      }
    }
    this.status = newStatus;
    return this;
  }
  updateName(name) {
    if (this._isSpanEnded())
      return this;
    this.name = name;
    return this;
  }
  end(endTime) {
    if (this._isSpanEnded()) {
      diag.error(`${this.name} ${this._spanContext.traceId}-${this._spanContext.spanId} - You can only call end() on a span once.`);
      return;
    }
    this.endTime = this._getTime(endTime);
    this._duration = hrTimeDuration(this.startTime, this.endTime);
    if (this._duration[0] < 0) {
      diag.warn("Inconsistent start and end time, startTime > endTime. Setting span duration to 0ms.", this.startTime, this.endTime);
      this.endTime = this.startTime.slice();
      this._duration = [0, 0];
    }
    if (this._droppedEventsCount > 0) {
      diag.warn(`Dropped ${this._droppedEventsCount} events because eventCountLimit reached`);
    }
    if (this._droppedLinksCount > 0) {
      diag.warn(`Dropped ${this._droppedLinksCount} links because linkCountLimit reached`);
    }
    if (this._spanProcessor.onEnding) {
      this._spanProcessor.onEnding(this);
    }
    this._recordEndMetrics?.();
    this._ended = true;
    this._spanProcessor.onEnd(this);
  }
  _getTime(inp) {
    if (typeof inp === "number" && inp <= otperformance.now()) {
      return hrTime(inp + this._performanceOffset);
    }
    if (typeof inp === "number") {
      return millisToHrTime(inp);
    }
    if (inp instanceof Date) {
      return millisToHrTime(inp.getTime());
    }
    if (isTimeInputHrTime(inp)) {
      return inp;
    }
    if (this._startTimeProvided) {
      return millisToHrTime(Date.now());
    }
    const msDuration = otperformance.now() - this._performanceStartTime;
    return addHrTimes(this.startTime, millisToHrTime(msDuration));
  }
  isRecording() {
    return this._ended === false;
  }
  recordException(exception, time) {
    const attributes = {};
    if (typeof exception === "string") {
      attributes[ATTR_EXCEPTION_MESSAGE] = exception;
    } else if (exception) {
      if (exception.code) {
        attributes[ATTR_EXCEPTION_TYPE] = exception.code.toString();
      } else if (exception.name) {
        attributes[ATTR_EXCEPTION_TYPE] = exception.name;
      }
      if (exception.message) {
        attributes[ATTR_EXCEPTION_MESSAGE] = exception.message;
      }
      if (exception.stack) {
        attributes[ATTR_EXCEPTION_STACKTRACE] = exception.stack;
      }
    }
    if (attributes[ATTR_EXCEPTION_TYPE] || attributes[ATTR_EXCEPTION_MESSAGE]) {
      this.addEvent(ExceptionEventName, attributes, time);
    } else {
      diag.warn(`Failed to record an exception ${exception}`);
    }
  }
  get duration() {
    return this._duration;
  }
  get ended() {
    return this._ended;
  }
  get droppedAttributesCount() {
    return this._droppedAttributesCount;
  }
  get droppedEventsCount() {
    return this._droppedEventsCount;
  }
  get droppedLinksCount() {
    return this._droppedLinksCount;
  }
  _isSpanEnded() {
    if (this._ended) {
      const error = new Error(`Operation attempted on ended Span {traceId: ${this._spanContext.traceId}, spanId: ${this._spanContext.spanId}}`);
      diag.warn(`Cannot execute the operation on ended Span {traceId: ${this._spanContext.traceId}, spanId: ${this._spanContext.spanId}}`, error);
    }
    return this._ended;
  }
  // Utility function to truncate given value within size
  // for value type of string, will truncate to given limit
  // for type of non-string, will return same value
  _truncateToLimitUtil(value, limit) {
    if (value.length <= limit) {
      return value;
    }
    return value.substring(0, limit);
  }
  /**
   * If the given attribute value is of type string and has more characters than given {@code attributeValueLengthLimit} then
   * return string with truncated to {@code attributeValueLengthLimit} characters
   *
   * If the given attribute value is array of strings then
   * return new array of strings with each element truncated to {@code attributeValueLengthLimit} characters
   *
   * Otherwise return same Attribute {@code value}
   *
   * @param value Attribute value
   * @returns truncated attribute value if required, otherwise same value
   */
  _truncateToSize(value) {
    const limit = this._attributeValueLengthLimit;
    if (limit <= 0) {
      diag.warn(`Attribute value limit must be positive, got ${limit}`);
      return value;
    }
    if (typeof value === "string") {
      return this._truncateToLimitUtil(value, limit);
    }
    if (Array.isArray(value)) {
      return value.map((val) => typeof val === "string" ? this._truncateToLimitUtil(val, limit) : val);
    }
    return value;
  }
  [inspectCustom](depth, options, inspect2) {
    const payload = {
      name: this.name,
      kind: this.kind,
      spanContext: this._spanContext,
      parentSpanContext: this.parentSpanContext,
      status: this.status,
      startTime: this.startTime,
      endTime: this.endTime,
      duration: this._duration,
      ended: this._ended,
      attributes: this.attributes,
      events: this.events,
      links: this.links,
      droppedAttributesCount: this._droppedAttributesCount,
      droppedEventsCount: this._droppedEventsCount,
      droppedLinksCount: this._droppedLinksCount,
      instrumentationScope: this.instrumentationScope,
      resource: { attributes: settledResourceAttributes(this.resource) }
    };
    return formatInspect("SpanImpl", payload, depth, options, inspect2);
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/Sampler.js
var SamplingDecision2;
(function(SamplingDecision3) {
  SamplingDecision3[SamplingDecision3["NOT_RECORD"] = 0] = "NOT_RECORD";
  SamplingDecision3[SamplingDecision3["RECORD"] = 1] = "RECORD";
  SamplingDecision3[SamplingDecision3["RECORD_AND_SAMPLED"] = 2] = "RECORD_AND_SAMPLED";
})(SamplingDecision2 || (SamplingDecision2 = {}));

// node_modules/@opentelemetry/sdk-trace/build/esm/semconv.js
var ATTR_OTEL_SPAN_PARENT_ORIGIN = "otel.span.parent.origin";
var ATTR_OTEL_SPAN_SAMPLING_RESULT = "otel.span.sampling_result";
var METRIC_OTEL_SDK_SPAN_LIVE = "otel.sdk.span.live";
var METRIC_OTEL_SDK_SPAN_STARTED = "otel.sdk.span.started";

// node_modules/@opentelemetry/sdk-trace/build/esm/TracerMetrics.js
var TracerMetrics = class {
  startedSpans;
  liveSpans;
  constructor(meter) {
    this.startedSpans = meter.createCounter(METRIC_OTEL_SDK_SPAN_STARTED, {
      unit: "{span}",
      description: "The number of created spans."
    });
    this.liveSpans = meter.createUpDownCounter(METRIC_OTEL_SDK_SPAN_LIVE, {
      unit: "{span}",
      description: "The number of currently live spans."
    });
  }
  startSpan(parentSpanCtx, samplingDecision) {
    const samplingDecisionStr = samplingDecisionToString(samplingDecision);
    this.startedSpans.add(1, {
      [ATTR_OTEL_SPAN_PARENT_ORIGIN]: parentOrigin(parentSpanCtx),
      [ATTR_OTEL_SPAN_SAMPLING_RESULT]: samplingDecisionStr
    });
    if (samplingDecision === SamplingDecision2.NOT_RECORD) {
      return () => {
      };
    }
    const liveSpanAttributes = {
      [ATTR_OTEL_SPAN_SAMPLING_RESULT]: samplingDecisionStr
    };
    this.liveSpans.add(1, liveSpanAttributes);
    return () => {
      this.liveSpans.add(-1, liveSpanAttributes);
    };
  }
};
function parentOrigin(parentSpanContext) {
  if (!parentSpanContext) {
    return "none";
  }
  if (parentSpanContext.isRemote) {
    return "remote";
  }
  return "local";
}
function samplingDecisionToString(decision) {
  switch (decision) {
    case SamplingDecision2.RECORD_AND_SAMPLED:
      return "RECORD_AND_SAMPLE";
    case SamplingDecision2.RECORD:
      return "RECORD_ONLY";
    case SamplingDecision2.NOT_RECORD:
      return "DROP";
  }
}

// node_modules/@opentelemetry/sdk-trace/build/esm/version.js
var VERSION2 = "2.12.0";

// node_modules/@opentelemetry/sdk-trace/build/esm/Tracer.js
var Tracer = class {
  _sampler;
  _spanLimits;
  _idGenerator;
  instrumentationScope;
  _resource;
  _spanProcessor;
  _tracerMetrics;
  /**
   * Constructs a new Tracer instance.
   */
  constructor(instrumentationScope, options) {
    this.instrumentationScope = instrumentationScope;
    this._sampler = options.sampler;
    this._spanLimits = options.spanLimits;
    this._resource = options.resource;
    this._idGenerator = options.idGenerator;
    this._spanProcessor = options.spanProcessor;
    const meter = options.meterProvider.getMeter("@opentelemetry/sdk-trace", VERSION2);
    this._tracerMetrics = new TracerMetrics(meter);
  }
  /**
   * Starts a new Span or returns the default NoopSpan based on the sampling
   * decision.
   */
  startSpan(name, options = {}, context2 = context.active()) {
    if (options.root) {
      context2 = trace.deleteSpan(context2);
    }
    const parentSpan = trace.getSpan(context2);
    if (isTracingSuppressed(context2)) {
      diag.debug("Instrumentation suppressed, returning Noop Span");
      const nonRecordingSpan = trace.wrapSpanContext(INVALID_SPAN_CONTEXT);
      return nonRecordingSpan;
    }
    const parentSpanContext = parentSpan?.spanContext();
    const spanId = this._idGenerator.generateSpanId();
    let validParentSpanContext;
    let traceId;
    let traceState;
    if (!parentSpanContext || !trace.isSpanContextValid(parentSpanContext)) {
      traceId = this._idGenerator.generateTraceId();
    } else {
      traceId = parentSpanContext.traceId;
      traceState = parentSpanContext.traceState;
      validParentSpanContext = parentSpanContext;
    }
    const spanKind = options.kind ?? SpanKind.INTERNAL;
    const links = (options.links ?? []).map((link) => {
      return {
        context: link.context,
        attributes: sanitizeAttributes(link.attributes)
      };
    });
    const attributes = sanitizeAttributes(options.attributes);
    const samplingResult = this._sampler.shouldSample(context2, traceId, name, spanKind, attributes, links);
    const recordEndMetrics = this._tracerMetrics.startSpan(parentSpanContext, samplingResult.decision);
    traceState = samplingResult.traceState ?? traceState;
    const traceFlags = samplingResult.decision === SamplingDecision.RECORD_AND_SAMPLED ? TraceFlags.SAMPLED : TraceFlags.NONE;
    const spanContext = { traceId, spanId, traceFlags, traceState };
    if (samplingResult.decision === SamplingDecision.NOT_RECORD) {
      diag.debug("Recording is off, propagating context in a non-recording span");
      const nonRecordingSpan = trace.wrapSpanContext(spanContext);
      return nonRecordingSpan;
    }
    const initAttributes = sanitizeAttributes(Object.assign(attributes, samplingResult.attributes));
    const span = new SpanImpl({
      resource: this._resource,
      scope: this.instrumentationScope,
      context: context2,
      spanContext,
      name,
      kind: spanKind,
      links,
      parentSpanContext: validParentSpanContext,
      attributes: initAttributes,
      startTime: options.startTime,
      spanProcessor: this._spanProcessor,
      spanLimits: this._spanLimits,
      recordEndMetrics
    });
    return span;
  }
  startActiveSpan(name, arg2, arg3, arg4) {
    let opts;
    let ctx;
    let fn;
    if (arguments.length < 2) {
      return;
    } else if (arguments.length === 2) {
      fn = arg2;
    } else if (arguments.length === 3) {
      opts = arg2;
      fn = arg3;
    } else {
      opts = arg2;
      ctx = arg3;
      fn = arg4;
    }
    const parentContext = ctx ?? context.active();
    const span = this.startSpan(name, opts, parentContext);
    const contextWithSpanSet = trace.setSpan(parentContext, span);
    return context.with(contextWithSpanSet, fn, void 0, span);
  }
  [inspectCustom](depth, options, inspect2) {
    const payload = {
      instrumentationScope: this.instrumentationScope,
      resource: { attributes: settledResourceAttributes(this._resource) },
      spanLimits: this._spanLimits
    };
    return formatInspect("Tracer", payload, depth, options, inspect2);
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/MultiSpanProcessor.js
var MultiSpanProcessor = class {
  _spanProcessors;
  constructor(spanProcessors) {
    this._spanProcessors = spanProcessors;
  }
  forceFlush() {
    const promises = [];
    for (const spanProcessor of this._spanProcessors) {
      promises.push(spanProcessor.forceFlush());
    }
    return new Promise((resolve2) => {
      Promise.all(promises).then(() => {
        resolve2();
      }).catch((error) => {
        globalErrorHandler(error || new Error("MultiSpanProcessor: forceFlush failed"));
        resolve2();
      });
    });
  }
  onStart(span, context2) {
    for (const spanProcessor of this._spanProcessors) {
      spanProcessor.onStart(span, context2);
    }
  }
  onEnding(span) {
    for (const spanProcessor of this._spanProcessors) {
      if (spanProcessor.onEnding) {
        spanProcessor.onEnding(span);
      }
    }
  }
  onEnd(span) {
    for (const spanProcessor of this._spanProcessors) {
      spanProcessor.onEnd(span);
    }
  }
  shutdown() {
    const promises = [];
    for (const spanProcessor of this._spanProcessors) {
      promises.push(spanProcessor.shutdown());
    }
    return new Promise((resolve2, reject) => {
      Promise.all(promises).then(() => {
        resolve2();
      }, reject);
    });
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/sampler/AlwaysOffSampler.js
var AlwaysOffSampler = class {
  shouldSample() {
    return {
      decision: SamplingDecision2.NOT_RECORD
    };
  }
  toString() {
    return "AlwaysOffSampler";
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/sampler/AlwaysOnSampler.js
var AlwaysOnSampler = class {
  shouldSample() {
    return {
      decision: SamplingDecision2.RECORD_AND_SAMPLED
    };
  }
  toString() {
    return "AlwaysOnSampler";
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/sampler/ParentBasedSampler.js
var ParentBasedSampler = class {
  _root;
  _remoteParentSampled;
  _remoteParentNotSampled;
  _localParentSampled;
  _localParentNotSampled;
  constructor(config) {
    this._root = config.root;
    if (!this._root) {
      globalErrorHandler(new Error("ParentBasedSampler must have a root sampler configured"));
      this._root = new AlwaysOnSampler();
    }
    this._remoteParentSampled = config.remoteParentSampled ?? new AlwaysOnSampler();
    this._remoteParentNotSampled = config.remoteParentNotSampled ?? new AlwaysOffSampler();
    this._localParentSampled = config.localParentSampled ?? new AlwaysOnSampler();
    this._localParentNotSampled = config.localParentNotSampled ?? new AlwaysOffSampler();
  }
  shouldSample(context2, traceId, spanName, spanKind, attributes, links) {
    const parentContext = trace.getSpanContext(context2);
    if (!parentContext || !isSpanContextValid(parentContext)) {
      return this._root.shouldSample(context2, traceId, spanName, spanKind, attributes, links);
    }
    if (parentContext.isRemote) {
      if (parentContext.traceFlags & TraceFlags.SAMPLED) {
        return this._remoteParentSampled.shouldSample(context2, traceId, spanName, spanKind, attributes, links);
      }
      return this._remoteParentNotSampled.shouldSample(context2, traceId, spanName, spanKind, attributes, links);
    }
    if (parentContext.traceFlags & TraceFlags.SAMPLED) {
      return this._localParentSampled.shouldSample(context2, traceId, spanName, spanKind, attributes, links);
    }
    return this._localParentNotSampled.shouldSample(context2, traceId, spanName, spanKind, attributes, links);
  }
  toString() {
    return `ParentBased{root=${this._root.toString()}, remoteParentSampled=${this._remoteParentSampled.toString()}, remoteParentNotSampled=${this._remoteParentNotSampled.toString()}, localParentSampled=${this._localParentSampled.toString()}, localParentNotSampled=${this._localParentNotSampled.toString()}}`;
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/platform/node/RandomIdGenerator.js
var SPAN_ID_BYTES = 8;
var TRACE_ID_BYTES = 16;
var RandomIdGenerator = class {
  /**
   * Returns a random 16-byte trace ID formatted/encoded as a 32 lowercase hex
   * characters corresponding to 128 bits.
   */
  generateTraceId = getIdGenerator(TRACE_ID_BYTES);
  /**
   * Returns a random 8-byte span ID formatted/encoded as a 16 lowercase hex
   * characters corresponding to 64 bits.
   */
  generateSpanId = getIdGenerator(SPAN_ID_BYTES);
};
var SHARED_BUFFER = Buffer.allocUnsafe(TRACE_ID_BYTES);
function getIdGenerator(bytes) {
  return function generateId() {
    for (let i = 0; i < bytes / 4; i++) {
      SHARED_BUFFER.writeUInt32BE(Math.random() * 2 ** 32 >>> 0, i * 4);
    }
    for (let i = 0; i < bytes; i++) {
      if (SHARED_BUFFER[i] > 0) {
        break;
      } else if (i === bytes - 1) {
        SHARED_BUFFER[bytes - 1] = 1;
      }
    }
    return SHARED_BUFFER.toString("hex", 0, bytes);
  };
}

// node_modules/@opentelemetry/sdk-trace/build/esm/TracerProvider.js
var ForceFlushState;
(function(ForceFlushState2) {
  ForceFlushState2[ForceFlushState2["resolved"] = 0] = "resolved";
  ForceFlushState2[ForceFlushState2["timeout"] = 1] = "timeout";
  ForceFlushState2[ForceFlushState2["error"] = 2] = "error";
  ForceFlushState2[ForceFlushState2["unresolved"] = 3] = "unresolved";
})(ForceFlushState || (ForceFlushState = {}));
var TracerProvider = class {
  _resource;
  _activeSpanProcessor;
  _forceFlushTimeoutMillis;
  _tracerOptions;
  _tracers = /* @__PURE__ */ new Map();
  constructor(options = {}) {
    this._forceFlushTimeoutMillis = options.forceFlushTimeoutMillis ?? 3e4;
    this._resource = options.resource ?? defaultResource();
    const spanProcessors = options.spanProcessors ?? [];
    this._activeSpanProcessor = new MultiSpanProcessor(spanProcessors);
    this._tracerOptions = {
      resource: this._resource,
      sampler: options.sampler ?? new ParentBasedSampler({
        root: new AlwaysOnSampler()
      }),
      spanLimits: {
        attributeCountLimit: options.spanLimits?.attributeCountLimit ?? 128,
        attributeValueLengthLimit: options.spanLimits?.attributeValueLengthLimit ?? Infinity,
        eventCountLimit: options.spanLimits?.eventCountLimit ?? 128,
        linkCountLimit: options.spanLimits?.linkCountLimit ?? 128,
        attributePerEventCountLimit: options.spanLimits?.attributePerEventCountLimit ?? 128,
        attributePerLinkCountLimit: options.spanLimits?.attributePerLinkCountLimit ?? 128
      },
      idGenerator: options.idGenerator || new RandomIdGenerator(),
      spanProcessor: this._activeSpanProcessor,
      meterProvider: options.meterProvider ?? {
        getMeter() {
          return createNoopMeter();
        }
      }
    };
  }
  getTracer(name, version, options) {
    const key = `${name}@${version || ""}:${options?.schemaUrl || ""}`;
    if (!this._tracers.has(key)) {
      this._tracers.set(key, new Tracer({ name, version, schemaUrl: options?.schemaUrl }, this._tracerOptions));
    }
    return this._tracers.get(key);
  }
  forceFlush(options) {
    const timeout = options?.timeoutMillis ?? this._forceFlushTimeoutMillis;
    const promises = this._activeSpanProcessor["_spanProcessors"].map((spanProcessor) => {
      return new Promise((resolve2) => {
        let state;
        const timeoutInterval = setTimeout(() => {
          resolve2(new Error(`Span processor did not completed within timeout period of ${timeout} ms`));
          state = ForceFlushState.timeout;
        }, timeout);
        spanProcessor.forceFlush().then(() => {
          clearTimeout(timeoutInterval);
          if (state !== ForceFlushState.timeout) {
            state = ForceFlushState.resolved;
            resolve2(state);
          }
        }).catch((error) => {
          clearTimeout(timeoutInterval);
          state = ForceFlushState.error;
          resolve2(error);
        });
      });
    });
    return new Promise((resolve2, reject) => {
      Promise.all(promises).then((results) => {
        const errors = results.filter((result) => result !== ForceFlushState.resolved);
        if (errors.length > 0) {
          reject(errors);
        } else {
          resolve2();
        }
      }).catch((error) => reject([error]));
    });
  }
  shutdown() {
    return this._activeSpanProcessor.shutdown();
  }
  [inspectCustom](depth, options, inspect2) {
    const processors = this._activeSpanProcessor["_spanProcessors"];
    const payload = {
      resource: { attributes: settledResourceAttributes(this._resource) },
      tracers: Array.from(this._tracers.keys()),
      spanProcessors: processors.map((p) => p.constructor?.name ?? "SpanProcessor")
    };
    return formatInspect("TracerProvider", payload, depth, options, inspect2);
  }
};

// node_modules/@opentelemetry/sdk-trace/build/esm/sampler/TraceIdRatioBasedSampler.js
var TraceIdRatioBasedSampler = class {
  _ratio;
  _upperBound;
  constructor(ratio = 0) {
    this._ratio = this._normalize(ratio);
    this._upperBound = this._ratio === 1 ? 4294967296 : Math.floor(this._ratio * 4294967295);
  }
  shouldSample(context2, traceId) {
    return {
      decision: isValidTraceId(traceId) && this._accumulate(traceId) < this._upperBound ? SamplingDecision2.RECORD_AND_SAMPLED : SamplingDecision2.NOT_RECORD
    };
  }
  toString() {
    return `TraceIdRatioBased{${this._ratio}}`;
  }
  _normalize(ratio) {
    if (typeof ratio !== "number" || isNaN(ratio))
      return 0;
    return ratio >= 1 ? 1 : ratio <= 0 ? 0 : ratio;
  }
  _accumulate(traceId) {
    let accumulation = 0;
    for (let i = 0; i < 32; i += 8) {
      let part = 0;
      for (let j = 0; j < 8; j++) {
        const c = traceId.charCodeAt(i + j);
        const v = c < 58 ? c - 48 : c < 71 ? c - 55 : c - 87;
        part = part << 4 | v;
      }
      accumulation = (accumulation ^ part) >>> 0;
    }
    return accumulation;
  }
};

// node_modules/@opentelemetry/sdk-trace-base/build/esm/config.js
var TracesSamplerValues;
(function(TracesSamplerValues2) {
  TracesSamplerValues2["AlwaysOff"] = "always_off";
  TracesSamplerValues2["AlwaysOn"] = "always_on";
  TracesSamplerValues2["ParentBasedAlwaysOff"] = "parentbased_always_off";
  TracesSamplerValues2["ParentBasedAlwaysOn"] = "parentbased_always_on";
  TracesSamplerValues2["ParentBasedTraceIdRatio"] = "parentbased_traceidratio";
  TracesSamplerValues2["TraceIdRatio"] = "traceidratio";
})(TracesSamplerValues || (TracesSamplerValues = {}));
var DEFAULT_RATIO = 1;
function loadDefaultConfig() {
  return {
    sampler: buildSamplerFromEnv(),
    forceFlushTimeoutMillis: 3e4,
    generalLimits: {
      attributeValueLengthLimit: getNumberFromEnv("OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT") ?? Infinity,
      attributeCountLimit: getNumberFromEnv("OTEL_ATTRIBUTE_COUNT_LIMIT") ?? 128
    },
    spanLimits: {
      attributeValueLengthLimit: getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT") ?? Infinity,
      attributeCountLimit: getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT") ?? 128,
      linkCountLimit: getNumberFromEnv("OTEL_SPAN_LINK_COUNT_LIMIT") ?? 128,
      eventCountLimit: getNumberFromEnv("OTEL_SPAN_EVENT_COUNT_LIMIT") ?? 128,
      attributePerEventCountLimit: getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_PER_EVENT_COUNT_LIMIT") ?? 128,
      attributePerLinkCountLimit: getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_PER_LINK_COUNT_LIMIT") ?? 128
    }
  };
}
function buildSamplerFromEnv() {
  const sampler = getStringFromEnv("OTEL_TRACES_SAMPLER") ?? TracesSamplerValues.ParentBasedAlwaysOn;
  switch (sampler) {
    case TracesSamplerValues.AlwaysOn:
      return new AlwaysOnSampler();
    case TracesSamplerValues.AlwaysOff:
      return new AlwaysOffSampler();
    case TracesSamplerValues.ParentBasedAlwaysOn:
      return new ParentBasedSampler({
        root: new AlwaysOnSampler()
      });
    case TracesSamplerValues.ParentBasedAlwaysOff:
      return new ParentBasedSampler({
        root: new AlwaysOffSampler()
      });
    case TracesSamplerValues.TraceIdRatio:
      return new TraceIdRatioBasedSampler(getSamplerProbabilityFromEnv());
    case TracesSamplerValues.ParentBasedTraceIdRatio:
      return new ParentBasedSampler({
        root: new TraceIdRatioBasedSampler(getSamplerProbabilityFromEnv())
      });
    default:
      diag.error(`OTEL_TRACES_SAMPLER value "${sampler}" invalid, defaulting to "${TracesSamplerValues.ParentBasedAlwaysOn}".`);
      return new ParentBasedSampler({
        root: new AlwaysOnSampler()
      });
  }
}
function getSamplerProbabilityFromEnv() {
  const probability = getNumberFromEnv("OTEL_TRACES_SAMPLER_ARG");
  if (probability == null) {
    diag.error(`OTEL_TRACES_SAMPLER_ARG is blank, defaulting to ${DEFAULT_RATIO}.`);
    return DEFAULT_RATIO;
  }
  if (probability < 0 || probability > 1) {
    diag.error(`OTEL_TRACES_SAMPLER_ARG=${probability} was given, but it is out of range ([0..1]), defaulting to ${DEFAULT_RATIO}.`);
    return DEFAULT_RATIO;
  }
  return probability;
}

// node_modules/@opentelemetry/sdk-trace-base/build/esm/utility.js
var DEFAULT_ATTRIBUTE_COUNT_LIMIT = 128;
var DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT = Infinity;
function reconfigureLimits(userConfig) {
  const spanLimits = Object.assign({}, userConfig.spanLimits);
  spanLimits.attributeCountLimit = userConfig.spanLimits?.attributeCountLimit ?? userConfig.generalLimits?.attributeCountLimit ?? getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_COUNT_LIMIT") ?? getNumberFromEnv("OTEL_ATTRIBUTE_COUNT_LIMIT") ?? DEFAULT_ATTRIBUTE_COUNT_LIMIT;
  spanLimits.attributeValueLengthLimit = userConfig.spanLimits?.attributeValueLengthLimit ?? userConfig.generalLimits?.attributeValueLengthLimit ?? getNumberFromEnv("OTEL_SPAN_ATTRIBUTE_VALUE_LENGTH_LIMIT") ?? getNumberFromEnv("OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT") ?? DEFAULT_ATTRIBUTE_VALUE_LENGTH_LIMIT;
  return Object.assign({}, userConfig, { spanLimits });
}

// node_modules/@opentelemetry/sdk-trace-base/build/esm/BasicTracerProvider-shim.js
var BasicTracerProvider = class extends TracerProvider {
  constructor(config = {}) {
    const mergedConfig = merge({}, loadDefaultConfig(), reconfigureLimits(config));
    delete mergedConfig.generalLimits;
    super(mergedConfig);
  }
};

// node_modules/telmoni/dist/index.mjs
import { Agent as HttpAgent, ClientRequest } from "http";
import { Agent as HttpsAgent } from "https";
import { urlToHttpOptions } from "url";
import { createHash } from "crypto";
import { randomUUID } from "crypto";
var SCOPE = "telmoni";
var DISTRO_NAME = "telemetry.distro.name";
var DISTRO = "telmoni";
var RUN_ID = "telmoni.run_id";
var AGENT = "telmoni.agent";
var USER_ID = "user.id";
var TAG_PREFIX = "telmoni.tag.";
var TAGS_MAX = 32;
var TAG_KEY_MAX = 64;
var TAG_VALUE_MAX = 256;
var NAME_MAX = 145;
var AGENT_MAX = 128;
var ERROR_TYPE_MAX = 128;
var MODEL_MAX = 128;
var PROVIDER_MAX = 128;
var USER_ID_MAX = 128;
var SESSION_ID_MAX = 200;
var BATCH_MAX_BYTES = 1 << 20;
var BATCH_SPANS_MAX = 1e3;
var ATTRIBUTE_KEY_MAX = 128;
var ATTRIBUTE_VALUE_MAX = 1024;
var BOUND_STALL_AFTER_S = "telmoni.bound.stall_after_s";
var BOUND_MAX_STEPS = "telmoni.bound.max_steps";
var BOUND_MAX_COST_USD = "telmoni.bound.max_cost_usd";
var SAMPLE_RATE = "telmoni.sample_rate";
var CANCELLED = "telmoni.cancelled";
var SAMPLED_OUT = "telmoni.sampled_out";
var RUN_START = "telmoni.run.start";
var ENVIRONMENT = "deployment.environment.name";
var RELEASE = "service.version";
var TRACEPARENT = "traceparent";
var BAGGAGE = "baggage";
var OPERATION = "gen_ai.operation.name";
var AGENT_NAME = "gen_ai.agent.name";
var TOOL_NAME = "gen_ai.tool.name";
var ERROR_TYPE = "error.type";
var RESPONSE_MODEL = "gen_ai.response.model";
var REQUEST_MODEL = "gen_ai.request.model";
var PROVIDER = "gen_ai.provider.name";
var INPUT_TOKENS = "gen_ai.usage.input_tokens";
var OUTPUT_TOKENS = "gen_ai.usage.output_tokens";
var CACHE_READ_INPUT_TOKENS = "gen_ai.usage.cache_read.input_tokens";
var CACHE_WRITE_INPUT_TOKENS = "gen_ai.usage.cache_write.input_tokens";
var SESSION_ID = "gen_ai.conversation.id";
var INPUT_MESSAGES = "gen_ai.input.messages";
var OUTPUT_MESSAGES = "gen_ai.output.messages";
var SYSTEM_INSTRUCTIONS = "gen_ai.system_instructions";
var TOOL_CALL_ARGUMENTS = "gen_ai.tool.call.arguments";
var TOOL_CALL_RESULT = "gen_ai.tool.call.result";
var CONTENT = /* @__PURE__ */ new Set([
  INPUT_MESSAGES,
  OUTPUT_MESSAGES,
  SYSTEM_INSTRUCTIONS,
  "gen_ai.tool.definitions",
  TOOL_CALL_ARGUMENTS,
  TOOL_CALL_RESULT,
  "gen_ai.retrieval.query.text",
  "gen_ai.retrieval.documents",
  "gen_ai.memory.query.text",
  "gen_ai.memory.records",
  "gen_ai.prompt.variable",
  "user.email",
  "user.full_name",
  "user.name"
]);
var TOOL_OPERATION = "execute_tool";
var CONTENT_MODE_HEADER = "Telmoni-Content-Mode";
var SENT_AT_HEADER = "Telmoni-Sent-At";
function names(error) {
  if (error === null || error === void 0) return { ctor: "", name: "" };
  const named = error;
  const ctor = typeof named.constructor?.name === "string" ? named.constructor.name : "";
  const name = typeof named.name === "string" ? named.name : "";
  return { ctor, name };
}
function errorType(error) {
  const { ctor, name } = names(error);
  if (ctor === "DOMException") return name || ctor;
  return ctor || name || "Error";
}
function errorName(error) {
  const { ctor, name } = names(error);
  return name || ctor || "Error";
}
var QueueFullError = class extends Error {
  constructor(spans) {
    super(`the export queue has no room for the record's ${spans} spans; flush or wait, then record it again`);
    this.name = "QueueFullError";
  }
};
function isAbort(error) {
  return typeof error === "object" && error !== null && error.name === "AbortError";
}
var VERSION3 = "0.1.0";
var ATTEMPTS = 3;
var REQUEST_TIMEOUT_MS = 1e4;
var ANSWER_MAX = 1 << 20;
var RETRY_AFTER_MAX_S = 60;
var WARNED_MAX = 1024;
var CONTENT_DOCS = "https://telmoni.com/docs/api/ingest#what-is-dropped-at-the-door";
var LONE_SURROGATE = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/g;
var DROPPED = /^span (\S+) dropped (\S+): (\w+)(?:; (.*))?$/;
var REFUSED = /^span (\S+) refused: (.*)$/;
var KINDS = {
  [SpanKind.INTERNAL]: 1,
  [SpanKind.SERVER]: 2,
  [SpanKind.CLIENT]: 3,
  [SpanKind.PRODUCER]: 4,
  [SpanKind.CONSUMER]: 5
};
var DOUBLES = /* @__PURE__ */ new Set([BOUND_MAX_COST_USD, SAMPLE_RATE]);
var INTEGERS = /* @__PURE__ */ new Set([
  BOUND_STALL_AFTER_S,
  BOUND_MAX_STEPS,
  INPUT_TOKENS,
  OUTPUT_TOKENS,
  CACHE_READ_INPUT_TOKENS,
  CACHE_WRITE_INPUT_TOKENS
]);
var fetchTransport = async (url, init) => {
  const response = await fetch(url, { ...init, redirect: "manual", signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return { status: response.status, headers: response.headers, text: () => textOf(response.body) };
};
var directTransport = (url, init) => new Promise((resolve2, reject) => {
  const body = Buffer.from(init.body);
  const signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const request = new ClientRequest(
    {
      ...urlToHttpOptions(new URL(url)),
      method: init.method,
      headers: { ...init.headers, "Content-Length": String(body.byteLength) },
      agent: /^https:/i.test(url) ? new HttpsAgent() : new HttpAgent(),
      signal
    },
    (response) => {
      response.on("error", () => {
      });
      const headers = {
        get: (name) => {
          const value = response.headers[name.toLowerCase()];
          return value === void 0 ? null : Array.isArray(value) ? value.join(", ") : value;
        }
      };
      resolve2({ status: response.statusCode ?? 0, headers, text: () => messageText(response) });
    }
  );
  request.on("error", (error) => reject(signal.aborted ? signal.reason : error));
  request.on("close", () => reject(new Error("the connection closed before an answer")));
  request.end(body);
});
async function messageText(response) {
  const decoder = new TextDecoder();
  let text = "";
  let left = ANSWER_MAX;
  try {
    for await (const chunk of response) {
      const part = chunk.subarray(0, left);
      text += decoder.decode(part, { stream: true });
      left -= part.byteLength;
      if (left <= 0) break;
    }
  } catch {
  }
  return text + decoder.decode();
}
async function textOf(body) {
  if (body === null) return "";
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  let left = ANSWER_MAX;
  try {
    while (left > 0) {
      const { done, value } = await reader.read();
      if (done) break;
      const part = value.subarray(0, left);
      text += decoder.decode(part, { stream: true });
      left -= part.byteLength;
    }
    await reader.cancel();
  } catch {
  }
  return text + decoder.decode();
}
var realSleep = (seconds, signal) => new Promise((resolve2) => {
  const done = () => {
    clearTimeout(timer);
    signal.removeEventListener("abort", done);
    resolve2();
  };
  const timer = setTimeout(done, seconds * 1e3);
  if (signal.aborted) done();
  else signal.addEventListener("abort", done, { once: true });
});
function sdkVersion() {
  const version = defaultResource().attributes["telemetry.sdk.version"];
  return typeof version === "string" ? version : "unknown";
}
var Exporter = class {
  #config;
  #transport;
  #sleep;
  #warn;
  #url;
  #warned = /* @__PURE__ */ new Set();
  #resource;
  #givenUp = new AbortController();
  #contentMode;
  constructor(config, hooks) {
    this.#config = config;
    this.#transport = hooks.transport;
    this.#sleep = hooks.sleep;
    this.#warn = hooks.warn;
    this.#url = `${config.endpoint}/otlp/v1/traces`;
    this.#resource = [
      attribute(DISTRO_NAME, DISTRO),
      attribute("telemetry.distro.version", VERSION3),
      attribute("telemetry.sdk.language", "nodejs"),
      attribute("telemetry.sdk.name", "opentelemetry"),
      attribute("telemetry.sdk.version", sdkVersion())
    ];
    if (config.environment !== void 0) this.#resource.push(attribute(ENVIRONMENT, config.environment));
    if (config.release !== void 0) this.#resource.push(attribute(RELEASE, config.release));
  }
  /** The project's mode, as the last answer named it; undefined before one. */
  get contentMode() {
    return this.#contentMode;
  }
  /**
   * Gives up what is left: the wait before a retry ends now, and no attempt
   * follows it. A shutdown past its deadline calls it, so a process that
   * ends without `process.exit()` is not held for the retries.
   */
  giveUp() {
    this.#givenUp.abort();
  }
  /**
   * Sends the spans, halved past ingest's caps; false once they failed for a
   * reason not their own, which the rest of a batch they are part of would meet.
   */
  async export(spans) {
    if (spans.length === 0) return true;
    if (spans.length > BATCH_SPANS_MAX) return this.#halve(spans);
    let body = this.#body(spans);
    if (Buffer.byteLength(body) > BATCH_MAX_BYTES) {
      if (spans.length > 1) return this.#halve(spans);
      body = this.#body(spans, true);
      if (Buffer.byteLength(body) > BATCH_MAX_BYTES) {
        this.warnOnce("too-large", "telmoni: a span past the 1 MiB an export may hold was dropped");
        return true;
      }
      this.warnOnce(
        "trimmed",
        "telmoni: a span past the 1 MiB an export may hold was sent without the attributes ingest drops for their length"
      );
    }
    return this.#send(body);
  }
  /** Exports each half of the spans, the second only where the first went. */
  async #halve(spans) {
    const half = Math.floor(spans.length / 2);
    return await this.export(spans.slice(0, half)) && this.export(spans.slice(half));
  }
  #body(spans, trimmed = false) {
    return JSON.stringify(
      this.encode(spans, trimmed),
      (_key, value) => typeof value === "string" ? value.replace(LONE_SURROGATE, "\uFFFD") : value
    );
  }
  async #send(body) {
    const headers = {
      "Content-Type": "application/json",
      "User-Agent": `telmoni-typescript/${VERSION3}`
    };
    if (this.#config.apiKey !== void 0) {
      headers["Authorization"] = `Bearer ${this.#config.apiKey}`;
    }
    let failure = "";
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      if (this.#givenUp.signal.aborted) return false;
      const sentAt = (BigInt(Math.trunc(Date.now())) * 1000000n).toString();
      let answer;
      try {
        answer = await this.#transport(this.#url, {
          method: "POST",
          headers: { ...headers, [SENT_AT_HEADER]: sentAt },
          body
        });
      } catch (error) {
        failure = errorName(error);
        await this.#wait(null, attempt);
        continue;
      }
      if (answer.status >= 200 && answer.status < 300) {
        await this.#read(answer);
        return true;
      }
      const text = await bodyOf(answer);
      if (answer.status === 429 || answer.status === 503) {
        failure = `${answer.status} ${problemType(text)}`;
        await this.#wait(answer.headers.get("Retry-After"), attempt);
        continue;
      }
      this.warnOnce(
        `status:${answer.status}`,
        `telmoni: export refused with ${answer.status} ${problemType(text)}; the batch was dropped`
      );
      return answer.status === 400 || answer.status === 413;
    }
    this.warnOnce(
      `failed:${failure}`,
      `telmoni: export failed after ${ATTEMPTS} attempts (${failure}); the batch was dropped`
    );
    return false;
  }
  /** OTLP's `ExportTraceServiceRequest`, in its JSON encoding; `trimmed`, without the attributes ingest drops for their length. */
  encode(spans, trimmed = false) {
    return {
      resourceSpans: [
        {
          resource: { attributes: this.#resource },
          scopeSpans: [
            {
              scope: { name: SCOPE, version: VERSION3 },
              spans: spans.map((span) => this.#span(span, trimmed))
            }
          ]
        }
      ]
    };
  }
  #span(span, trimmed = false) {
    const keepContent = this.#config.captureContent && this.#contentMode === "on";
    const attributes = [];
    for (const [key, value] of Object.entries(span.attributes)) {
      if (value === void 0) continue;
      if (!keepContent && CONTENT.has(key)) continue;
      if (trimmed && pastCaps(key, value)) continue;
      attributes.push(attribute(key, value));
    }
    const spanContext = span.spanContext();
    const parent = span.parentSpanContext;
    const start = span.startTime;
    const end = isUnset(span.endTime) ? start : span.endTime;
    const encoded = {
      traceId: spanContext.traceId,
      spanId: spanContext.spanId,
      ...parent !== void 0 && isSpanContextValid(parent) ? { parentSpanId: parent.spanId } : {},
      name: span.name,
      kind: KINDS[span.kind] ?? 1,
      startTimeUnixNano: nanos(start),
      endTimeUnixNano: nanos(end),
      attributes
    };
    if (span.status.code === SpanStatusCode.ERROR) {
      encoded.status = { code: 2 };
    }
    return encoded;
  }
  async #read(answer) {
    const mode = answer.headers.get(CONTENT_MODE_HEADER);
    if (mode) this.#contentMode = mode;
    const decoded = parseJson(await bodyOf(answer));
    const partial = isRecord(decoded) ? decoded["partialSuccess"] : void 0;
    if (!isRecord(partial)) return;
    const message = partial["errorMessage"];
    if (typeof message === "string" && message !== "") this.#note(message);
  }
  #note(message) {
    for (const line of message.split(/\r?\n/)) {
      const dropped = DROPPED.exec(line);
      if (dropped !== null) {
        const [, , attributeName = "", reason = "", rest] = dropped;
        let text = `telmoni: the server dropped ${attributeName} (${reason}`;
        if (rest) text += `; ${rest}`;
        text += `); ${remedy(attributeName, reason)}`;
        this.warnOnce(`dropped:${attributeName}:${reason}`, text);
        continue;
      }
      const refused = REFUSED.exec(line);
      if (refused !== null) {
        const why = refused[2] ?? "";
        this.warnOnce(`refused:${why}`, `telmoni: the server refused a span: ${why}`);
        continue;
      }
      if (line.startsWith("and ") || line === "") continue;
      this.warnOnce(`line:${line}`, `telmoni: the server said: ${line}`);
    }
  }
  /** Before the next attempt; nothing after the last. */
  async #wait(retryAfter, attempt) {
    if (attempt + 1 >= ATTEMPTS) return;
    let seconds = 2 ** attempt;
    if (retryAfter !== null && /^\s*[+-]?\d+\s*$/.test(retryAfter)) {
      seconds = Number.parseInt(retryAfter, 10);
    }
    await this.#sleep(Math.min(Math.max(seconds, 0), RETRY_AFTER_MAX_S), this.#givenUp.signal);
  }
  /** Warns `text` once per client under `key`, as every warning is. */
  warnOnce(key, text) {
    if (this.#warned.has(key)) return;
    if (this.#warned.size >= WARNED_MAX) this.#warned.clear();
    this.#warned.add(key);
    try {
      this.#warn(text);
    } catch {
    }
  }
};
function pastCaps(key, value) {
  if (Array.from(key).length > ATTRIBUTE_KEY_MAX) return true;
  const text = Array.isArray(value) ? JSON.stringify(value.filter((item) => item !== null && item !== void 0)) : String(value);
  return Array.from(text).length > ATTRIBUTE_VALUE_MAX;
}
function remedy(attributeName, reason) {
  if (reason === "content") return `the project's content mode decides whether content is kept: ${CONTENT_DOCS}`;
  if (reason === "unlisted") return `send it as the tag ${TAG_PREFIX}${attributeName} to keep it`;
  if (reason === "over_cap") return "shorten it to keep it";
  return "see the server's answer";
}
function problemType(body) {
  const decoded = parseJson(body);
  const message = isRecord(decoded) ? decoded["message"] : void 0;
  if (typeof message !== "string" || !message.startsWith("/errors/")) return "";
  return message.split(":", 1)[0] ?? "";
}
async function bodyOf(answer) {
  try {
    return await answer.text();
  } catch {
    return "";
  }
}
function parseJson(text) {
  try {
    return JSON.parse(text === "" ? "{}" : text);
  } catch {
    return void 0;
  }
}
function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isUnset(time) {
  return time[0] === 0 && time[1] === 0;
}
function nanos(time) {
  const count = BigInt(Math.trunc(time[0])) * 1000000000n + BigInt(Math.trunc(time[1]));
  return count >= 0n && count < 2n ** 64n ? count.toString() : "0";
}
function attribute(key, value) {
  return { key, value: anyValue(key, value) };
}
function anyValue(key, value) {
  if (typeof value === "boolean") return { boolValue: value };
  if (typeof value === "number") {
    if (DOUBLES.has(key)) return { doubleValue: value };
    const whole2 = Math.trunc(value);
    if ((INTEGERS.has(key) || Number.isSafeInteger(value)) && whole2 >= -(2 ** 63) && whole2 < 2 ** 63) {
      return { intValue: String(whole2) };
    }
    return { doubleValue: value };
  }
  if (typeof value === "string") return { stringValue: value };
  if (Array.isArray(value)) {
    const values = [];
    for (const item of value) {
      if (item !== null && item !== void 0) values.push(anyValue("", item));
    }
    return { arrayValue: { values } };
  }
  return { stringValue: String(value) };
}
var Ids = class {
  #random = new RandomIdGenerator();
  #given;
  generateTraceId() {
    return this.#given?.traceId ?? this.#random.generateTraceId();
  }
  generateSpanId() {
    return this.#given?.spanId ?? this.#random.generateSpanId();
  }
  /**
   * `open`, with the span it opens taking these ids. It runs synchronously,
   * so no other span can open in between and take them.
   */
  given(traceId, spanId, open) {
    this.#given = { traceId, spanId };
    try {
      return open();
    } finally {
      this.#given = void 0;
    }
  }
};
function spanIdAt(runHex, place) {
  const digest = createHash("sha1").update(Buffer.from(runHex, "hex")).update(String(place)).digest();
  digest[6] = (digest[6] ?? 0) & 15 | 80;
  return digest.subarray(0, 8).toString("hex");
}
var MAX_QUEUE_SIZE = 2048;
var MAX_BATCH_SIZE = 512;
var SCHEDULE_DELAY_S = 5;
var SHUTDOWN_TIMEOUT_S = 30;
var Processor = class {
  #exporter;
  #warn;
  #maxQueueSize;
  #maxBatchSize;
  #delayMs;
  #queue = [];
  /**
   * The queue's first span is the `#taken`th ever queued; a batch stops at
   * each fence, a record's first span and one past its last.
   */
  #taken = 0;
  #fences = [];
  /** The record being built: its trace, its spans as they end, and its room. */
  #stage;
  #reserved = 0;
  #dropped = 0;
  #urgent = false;
  #flushers = [];
  #timer;
  #inFlight;
  #down = false;
  /** Set once a shutdown's deadline has passed: nothing more is started. */
  #givenUp = false;
  constructor(exporter, warn, options = {}) {
    this.#exporter = exporter;
    this.#warn = (message) => {
      try {
        warn(message);
      } catch {
      }
    };
    this.#maxQueueSize = options.maxQueueSize ?? MAX_QUEUE_SIZE;
    this.#maxBatchSize = options.maxBatchSize ?? MAX_BATCH_SIZE;
    this.#delayMs = (options.scheduleDelaySeconds ?? SCHEDULE_DELAY_S) * 1e3;
  }
  /**
   * Runs `build`, staging the spans of trace `traceId` as they end, then
   * queues them whole, to travel in exports of their own: so the same record
   * sent again is the same bytes, whatever else ends meanwhile. Throws
   * `QueueFullError`, running nothing, when the queue has no room for the
   * record's `need` spans; the room is kept for them meanwhile. A `build` that
   * throws queues nothing. Of the application's, it runs the root sampler and
   * the reads of the caller's record alone, a record's warnings given before it.
   */
  record(traceId, need, build) {
    if (this.#queue.length + need > this.#maxQueueSize) throw new QueueFullError(need);
    const stage = { traceId, spans: [] };
    this.#stage = stage;
    this.#reserved = need;
    try {
      build();
    } finally {
      this.#stage = void 0;
      this.#reserved = 0;
    }
    if (this.#down || stage.spans.length === 0) return;
    const first = this.#taken + this.#queue.length;
    if (first > this.#taken) this.#fences.push(first);
    this.#fences.push(first + stage.spans.length);
    for (const span of stage.spans) this.#queue.push(span);
    this.#wake(0);
  }
  onStart(_span, _parentContext) {
  }
  onEnd(span) {
    if (this.#down || SAMPLED_OUT in span.attributes) return;
    if (this.#stage !== void 0 && span.spanContext().traceId === this.#stage.traceId) {
      this.#stage.spans.push(span);
      return;
    }
    if (this.#queue.length + this.#reserved >= this.#maxQueueSize) {
      this.#dropped += 1;
      return;
    }
    this.#queue.push(span);
    if (span.name === RUN_START) this.#urgent = true;
    this.#wake(this.#due() ? 0 : this.#delayMs);
  }
  /** Resolves once the queue is empty and the export in flight has settled. */
  forceFlush() {
    if (this.#idle() || this.#givenUp) return Promise.resolve();
    return new Promise((resolve2) => {
      this.#flushers.push(resolve2);
      this.#wake(0);
    });
  }
  /**
   * Drains, then takes nothing more. Past the timeout what is left is given
   * up: the wait for a retry ends there and no batch or attempt follows, so
   * nothing of the SDK's but a request already in flight, which its own
   * timeout bounds, holds the process the caller is ending, as the other
   * SDKs' workers hold none.
   */
  async shutdown() {
    if (this.#down) return;
    this.#down = true;
    const deadline = Date.now() + SHUTDOWN_TIMEOUT_S * 1e3;
    while (!this.#idle()) {
      if (this.#inFlight === void 0) this.#tick();
      const remaining = deadline - Date.now();
      if (remaining <= 0) {
        this.#givenUp = true;
        this.#exporter.giveUp();
        break;
      }
      await Promise.race([this.#inFlight, pause(remaining)]);
    }
    if (this.#timer !== void 0) {
      clearTimeout(this.#timer);
      this.#timer = void 0;
    }
  }
  #idle() {
    return this.#queue.length === 0 && this.#inFlight === void 0;
  }
  /** Whether the worker should export without waiting; a record queued goes at once, as a live run's start does. */
  #due() {
    return this.#down || this.#flushers.length > 0 || this.#urgent || this.#fences.length > 0 || this.#queue.length >= this.#maxBatchSize;
  }
  // The worker is a timer, never referenced: an idle SDK never keeps the
  // process alive, and a pending one fires no later than the delay.
  #wake(ms) {
    if (this.#givenUp) return;
    if (this.#timer !== void 0) {
      if (ms > 0) return;
      clearTimeout(this.#timer);
    }
    const timer = setTimeout(() => {
      this.#timer = void 0;
      this.#tick();
    }, ms);
    timer.unref();
    this.#timer = timer;
  }
  /** One batch, one at a time; the export's end looks again. */
  #tick() {
    if (this.#inFlight !== void 0 || this.#givenUp) return;
    const fence = this.#fences[0];
    const batch = this.#queue.splice(0, Math.min(this.#maxBatchSize, (fence ?? Infinity) - this.#taken));
    this.#taken += batch.length;
    while ((this.#fences[0] ?? Infinity) <= this.#taken) this.#fences.shift();
    const dropped = this.#dropped;
    this.#dropped = 0;
    this.#urgent = false;
    if (dropped > 0) {
      this.#warn(`telmoni: the export queue was full; ${dropped} spans were dropped`);
    }
    if (batch.length === 0) {
      this.#settle();
      return;
    }
    this.#inFlight = this.#send(batch).then(() => {
      this.#inFlight = void 0;
      this.#settle();
    });
  }
  async #send(batch) {
    try {
      await this.#exporter.export(batch);
    } catch (error) {
      this.#warn(`telmoni: an export failed (${errorName(error)}); the batch was dropped`);
    }
  }
  #settle() {
    if (this.#queue.length > 0) {
      this.#wake(this.#due() ? 0 : this.#delayMs);
      return;
    }
    const flushers = this.#flushers;
    this.#flushers = [];
    for (const resolve2 of flushers) resolve2();
  }
};
function pause(ms) {
  return new Promise((resolve2) => {
    const timer = setTimeout(resolve2, ms);
    timer.unref();
  });
}
var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
var HEX = /^[0-9a-f]+$/;
function writeHeaders(headers, span, runId, agent) {
  const sampled = (span.traceFlags & TraceFlags.SAMPLED) !== 0 ? "01" : "00";
  setHeader(headers, TRACEPARENT, `00-${span.traceId}-${span.spanId}-${sampled}`);
  const members = (getHeader(headers, BAGGAGE) ?? "").split(",").map((member) => member.trim()).filter((member) => member !== "" && !isOurs(member));
  members.push(`${RUN_ID}=${runId}`, `${AGENT}=${encodeBaggageValue(agent)}`);
  setHeader(headers, BAGGAGE, members.join(","));
}
function readHeaders(headers) {
  const traceparent = getHeader(headers, TRACEPARENT);
  if (traceparent === void 0) return void 0;
  const spanContext = parseTraceparent(traceparent);
  if (spanContext === void 0) return void 0;
  const members = baggageMembers(getHeader(headers, BAGGAGE) ?? "");
  const runId = members.get(RUN_ID);
  const agent = members.get(AGENT);
  if (runId === void 0 || !UUID.test(runId) || agent === void 0 || agent === "") return void 0;
  return { spanContext, runId: runId.toLowerCase(), agent };
}
function parseTraceparent(header) {
  const parts = header.trim().split("-");
  if (parts.length < 4) return void 0;
  const [version, traceId, spanId, flags] = parts;
  if (!isHex(version, 2) || version === "ff") return void 0;
  if (version === "00" && parts.length !== 4) return void 0;
  if (!isHex(traceId, 32) || !/[1-9a-f]/.test(traceId)) return void 0;
  if (!isHex(spanId, 16) || !/[1-9a-f]/.test(spanId)) return void 0;
  if (!isHex(flags, 2)) return void 0;
  return { traceId, spanId, traceFlags: Number.parseInt(flags, 16) & TraceFlags.SAMPLED, isRemote: true };
}
function baggageMembers(header) {
  const members = /* @__PURE__ */ new Map();
  for (const member of header.split(",")) {
    const equals = member.indexOf("=");
    if (equals < 0) continue;
    const key = member.slice(0, equals).trim();
    const value = member.slice(equals + 1).split(";", 1)[0].trim();
    if (key !== "") members.set(key, decodeBaggageValue(value));
  }
  return members;
}
function isOurs(member) {
  const key = member.split("=", 1)[0].trim();
  return key === RUN_ID || key === AGENT;
}
function isHex(text, length) {
  return text.length === length && HEX.test(text);
}
function encodeBaggageValue(value) {
  let out = "";
  for (const byte of new TextEncoder().encode(value)) {
    out += allowedInBaggage(byte) ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
  }
  return out;
}
function decodeBaggageValue(value) {
  const bytes = [];
  const encoder = new TextEncoder();
  for (let i = 0; i < value.length; ) {
    const pair = value.slice(i + 1, i + 3);
    if (value[i] === "%" && pair.length === 2 && HEX.test(pair.toLowerCase())) {
      bytes.push(Number.parseInt(pair, 16));
      i += 3;
      continue;
    }
    const char = String.fromCodePoint(value.codePointAt(i));
    for (const byte of encoder.encode(char)) bytes.push(byte);
    i += char.length;
  }
  return new TextDecoder("utf-8", { ignoreBOM: true }).decode(Uint8Array.from(bytes));
}
function allowedInBaggage(byte) {
  return byte === 33 || byte >= 35 && byte <= 43 && byte !== 37 || byte >= 45 && byte <= 58 || byte >= 60 && byte <= 91 || byte >= 93 && byte <= 126;
}
function hasGet(headers) {
  return typeof headers.get === "function";
}
function getHeader(headers, name) {
  if (hasGet(headers)) {
    const value = headers.get(name);
    return typeof value === "string" ? value : void 0;
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() !== name) continue;
    if (typeof value === "string") return value;
    if (Array.isArray(value)) return value.join(",");
  }
  return void 0;
}
function setHeader(headers, name, value) {
  if (hasGet(headers)) {
    headers.set(name, value);
    return;
  }
  const record = headers;
  for (const key of Object.keys(record)) {
    if (key.toLowerCase() === name) delete record[key];
  }
  record[name] = value;
}
var RUN_KEY = createContextKey("telmoni.run");
var END = /* @__PURE__ */ Symbol("telmoni.end");
function currentRun(ctx = context.active()) {
  const run = ctx.getValue(RUN_KEY);
  return run instanceof Run ? run : void 0;
}
var Handle = class {
  /**
   * The OpenTelemetry context with this span current: for an application
   * without a context manager to nest its own spans under ours explicitly.
   */
  context;
  span;
  #warnOnce;
  #ended = false;
  constructor(span, parent, run, warnOnce) {
    this.span = span;
    this.#warnOnce = warnOnce;
    this.context = trace.setSpan(parent, span).setValue(RUN_KEY, run ?? this);
  }
  /** Mark it failed, with the error's class and never its message. */
  fail(errorType2) {
    const given = errorType2;
    const text = given ? typeOfError(given, this.#warnOnce) : "";
    if (text !== "") {
      this.span.setAttribute(ERROR_TYPE, cut(text, ERROR_TYPE_MAX, "span's error type", this.#warnOnce));
    }
    this.span.setStatus({ code: SpanStatusCode.ERROR });
  }
  /** Mark it cancelled by the agent, which is neither ok nor an error. */
  cancel() {
    this.span.setAttribute(CANCELLED, true);
  }
  [END](outcome) {
    if (this.#ended) return;
    this.#ended = true;
    if (outcome.failed) {
      if (isAbort(outcome.error)) this.cancel();
      else this.fail(errorType(outcome.error));
    }
    this.span.end();
  }
};
var Parent = class extends Handle {
  #opener;
  #run;
  constructor(opener, span, parent, run) {
    super(span, parent, run, opener.warnOnce);
    this.#opener = opener;
    this.#run = run ?? this;
  }
  step(name, fn) {
    return within(this.#opener.step(this.#run, this.context, name), fn);
  }
  modelCall(model, a, b) {
    const [options, fn] = split(a, b);
    return within(this.#opener.modelCall(this.#run, this.context, model, options ?? {}), fn);
  }
  toolCall(name, a, b) {
    const [options, fn] = split(a, b);
    return within(this.#opener.toolCall(this.#run, this.context, name, options ?? {}), fn);
  }
};
var Run = class extends Parent {
  runId;
  agent;
  /** Whether the sample rate kept this run out: nothing of it is sent, nor handed to another service. */
  sampledOut;
  #inherited;
  constructor(opener, span, parent, runId, agent, inherited, sampledOut = false) {
    super(opener, span, parent, void 0);
    this.runId = runId;
    this.agent = agent;
    this.sampledOut = sampledOut;
    this.#inherited = { ...inherited };
  }
  /** What every span inside the run carries. */
  get inherited() {
    return { ...this.#inherited };
  }
};
var Step = class extends Parent {
};
var ModelCall = class extends Handle {
  #warnOnce;
  constructor(span, parent, run, warnOnce) {
    super(span, parent, run, warnOnce);
    this.#warnOnce = warnOnce;
  }
  /** What the model answered: its name, its tokens, and its messages. */
  answered(answer) {
    const model = filled(answer.responseModel, "response model", this.#warnOnce);
    if (model !== void 0) {
      this.span.setAttribute(RESPONSE_MODEL, cut(model, MODEL_MAX, "response model", this.#warnOnce));
    }
    this.span.setAttributes(usageOf(answer.usage, this.#warnOnce));
    if (answer.outputMessages !== void 0) {
      this.span.setAttribute(OUTPUT_MESSAGES, asJson(answer.outputMessages));
    }
  }
};
var ToolCall = class extends Handle {
  /** What the tool returned: content, sent only when asked and allowed. */
  returned(result) {
    this.span.setAttribute(TOOL_CALL_RESULT, asJson(result));
  }
};
function within(handle, fn) {
  let result;
  try {
    result = context.with(handle.context, fn, void 0, handle);
  } catch (error) {
    handle[END]({ failed: true, error });
    throw error;
  }
  if (isPromiseLike2(result)) {
    return result.then(
      (value) => {
        handle[END]({ failed: false });
        return value;
      },
      (error) => {
        handle[END]({ failed: true, error });
        throw error;
      }
    );
  }
  handle[END]({ failed: false });
  return result;
}
function split(a, b) {
  if (typeof a === "function") return [void 0, a];
  if (b === void 0) throw new TypeError("a callback is needed");
  return [a, b];
}
var Opener = class {
  #tracer;
  #processor;
  #config;
  #ids;
  #warnOnce;
  constructor(tracer, processor, config, ids, warnOnce) {
    this.#tracer = tracer;
    this.#processor = processor;
    this.#config = config;
    this.#ids = ids;
    this.#warnOnce = warnOnce;
  }
  /** The client's warning, once per key, which every handle gives. */
  get warnOnce() {
    return this.#warnOnce;
  }
  run(given, options) {
    const named = given;
    if (!isSet(named) || textOf2(named).trim() === "") {
      throw new TypeError("a run needs its agent's name");
    }
    const agent = cut(asText(named, "run's agent", this.#warnOnce), AGENT_MAX, "run's agent", this.#warnOnce);
    const rate = options.sampleRate ?? this.#config.sampleRate;
    if (typeof rate !== "number" || !(rate > 0 && rate <= 1)) {
      throw new RangeError("sampleRate must be a number above 0 and up to 1");
    }
    const bounds = boundsOf(options.bounds, this.#warnOnce);
    const sampledOut = rate < 1 && Math.random() >= rate;
    const runId = randomUUID();
    const inherited = { [RUN_ID]: runId, [AGENT]: agent };
    const user = filled(options.userId, "user id", this.#warnOnce);
    if (user !== void 0 && fits(user, USER_ID_MAX, "user id", this.#warnOnce)) {
      inherited[USER_ID] = user;
    }
    const session = filled(options.sessionId, "session id", this.#warnOnce);
    if (session !== void 0 && fits(session, SESSION_ID_MAX, "session id", this.#warnOnce)) {
      inherited[SESSION_ID] = session;
    }
    if (sampledOut) inherited[SAMPLED_OUT] = true;
    const attributes = {
      [OPERATION]: "invoke_agent",
      [AGENT_NAME]: agent,
      ...inherited,
      ...bounds,
      [SAMPLE_RATE]: rate,
      ...tagsOf(Object.entries(options.tags ?? {}), this.#warnOnce)
    };
    const parent = context.active();
    const span = this.#start(`invoke_agent ${agent}`, parent, attributes, SpanKind.INTERNAL);
    const run = new Run(this, span, parent, runId, agent, inherited, sampledOut);
    const start = startTimeOf(span);
    const opening = {
      kind: SpanKind.INTERNAL,
      attributes: { ...inherited, ...bounds, [SAMPLE_RATE]: rate }
    };
    if (start !== void 0) opening.startTime = start;
    this.#tracer.startSpan(RUN_START, opening, run.context).end(start);
    return run;
  }
  /**
   * A run another service opened, continued here under the span the headers
   * named: a run whose own span is the caller's, non-recording here, so its
   * steps and calls nest under it and carry the run, and nothing of it is
   * sent or ended from this side.
   */
  continued(remote, runId, given) {
    const agent = cut(given, AGENT_MAX, "run's agent", this.#warnOnce);
    const inherited = { [RUN_ID]: runId, [AGENT]: agent };
    return new Run(this, trace.wrapSpanContext(remote), context.active(), runId, agent, inherited);
  }
  step(run, parent, given) {
    let name = asText(given, "step's name", this.#warnOnce);
    if (name === "") {
      this.#warnOnce("step:name", "telmoni: a step needs its name; one without is sent named step");
      name = "step";
    }
    const span = this.#start(cut(name, NAME_MAX, "step's name", this.#warnOnce), parent, run.inherited, SpanKind.INTERNAL);
    return new Step(this, span, parent, run);
  }
  modelCall(run, parent, given, options) {
    const asked = asText(given, "model", this.#warnOnce);
    const operation = typeof options.operation === "string" && options.operation.trim() !== "" ? options.operation : "chat";
    const attributes = { ...run.inherited, [OPERATION]: operation };
    const model = asked === "" ? void 0 : cut(asked, MODEL_MAX, "model", this.#warnOnce);
    if (model === void 0) {
      this.#warnOnce(
        "call:model",
        "telmoni: a model call needs its model; one without is sent named by its operation alone"
      );
    } else {
      attributes[REQUEST_MODEL] = model;
    }
    const provider = filled(options.provider, "provider", this.#warnOnce);
    if (provider !== void 0) attributes[PROVIDER] = cut(provider, PROVIDER_MAX, "provider", this.#warnOnce);
    if (isSet(options.inputMessages)) {
      attributes[INPUT_MESSAGES] = asJson(options.inputMessages);
    }
    if (isSet(options.systemInstructions)) {
      attributes[SYSTEM_INSTRUCTIONS] = asJson(options.systemInstructions);
    }
    const name = cut(
      model === void 0 ? operation : `${operation} ${model}`,
      NAME_MAX,
      "model call's name",
      this.#warnOnce
    );
    const span = this.#start(name, parent, attributes, SpanKind.CLIENT);
    return new ModelCall(span, parent, run, this.#warnOnce);
  }
  toolCall(run, parent, given, options) {
    const name = cut(asText(given, "tool's name", this.#warnOnce), NAME_MAX, "tool's name", this.#warnOnce);
    const attributes = {
      ...run.inherited,
      [OPERATION]: TOOL_OPERATION,
      [TOOL_NAME]: name
    };
    if (isSet(options.arguments)) {
      attributes[TOOL_CALL_ARGUMENTS] = asJson(options.arguments);
    }
    const span = this.#start(`execute_tool ${name}`, parent, attributes, SpanKind.INTERNAL);
    return new ToolCall(span, parent, run, this.#warnOnce);
  }
  /**
   * A run that has ended, sent as the live calls would have sent it.
   *
   * Its trace is its own, named by the run's id, whatever context is active;
   * each span's id is derived from that id and the span's place in the record.
   * Its spans are queued whole once built, the run's start first and the
   * run's own last, and travel in exports of their own, so the same record
   * sent again is the same bytes, whatever else is sent meanwhile. Throws
   * `QueueFullError`, queuing nothing, when the export queue has no room for
   * the whole record.
   */
  record(record) {
    const agent = record.agent;
    if (typeof agent !== "string" || agent.trim() === "") {
      throw new TypeError("a run needs its agent's name");
    }
    if ([...agent].length > AGENT_MAX) {
      throw new RangeError(`a recorded run's agent must be up to ${AGENT_MAX} characters`);
    }
    const runHex = uuidHex(record.runId);
    check(record, "run");
    const tags = record.tags ?? {};
    const tagged = isObject2(tags) ? Object.entries(tags) : void 0;
    if (tagged === void 0 || tagged.some(([, value]) => typeof value !== "string")) {
      throw new TypeError("a recorded run's tags must be an object of strings");
    }
    const items = read(record);
    for (const each of [record, ...items.flatMap(([item, calls]) => [item, ...calls])]) {
      const [start, end] = [hrTimeOf(each.start), hrTimeOf(each.end)];
      if (!readable(start) || !readable(end)) {
        throw new RangeError("a recorded time must fall after the Unix epoch and less than 2^64 nanoseconds after it");
      }
      if (later(start, end)) throw new RangeError("a recorded span cannot end before it starts");
    }
    const rate = this.#config.sampleRate;
    const runId = [
      runHex.slice(0, 8),
      runHex.slice(8, 12),
      runHex.slice(12, 16),
      runHex.slice(16, 20),
      runHex.slice(20)
    ].join("-");
    const inherited = { [RUN_ID]: runId, [AGENT]: record.agent };
    if (record.userId) inherited[USER_ID] = record.userId;
    if (record.sessionId) inherited[SESSION_ID] = record.sessionId;
    const attributes = {
      [OPERATION]: "invoke_agent",
      [AGENT_NAME]: record.agent,
      ...inherited,
      [SAMPLE_RATE]: rate
    };
    Object.assign(attributes, tagsOf(tagged, this.#warnOnce));
    if (rate < 1 && Math.random() >= rate) return;
    const usages = /* @__PURE__ */ new Map();
    for (const [item, calls] of items) {
      for (const each of item.type === "step" ? calls : [item]) {
        if (each.type === "model_call") usages.set(each, usageOf(each.usage, this.#warnOnce));
      }
    }
    let place = 0;
    const open = (name, parent, spanAttributes, kind, at) => this.#ids.given(
      runHex,
      spanIdAt(runHex, place++),
      () => this.#tracer.startSpan(name, { kind, attributes: spanAttributes, startTime: hrTimeOf(at) }, parent)
    );
    const call = (item, parent) => {
      if (item.type === "model_call") {
        const operation = typeof item.operation === "string" && item.operation.trim() !== "" ? item.operation : "chat";
        const callAttributes = {
          ...inherited,
          [OPERATION]: operation,
          [REQUEST_MODEL]: item.model
        };
        if (item.provider) callAttributes[PROVIDER] = item.provider;
        Object.assign(callAttributes, usages.get(item));
        close(open(`${operation} ${item.model}`, parent, callAttributes, SpanKind.CLIENT, item.start), item);
      } else {
        const callAttributes = {
          ...inherited,
          [OPERATION]: TOOL_OPERATION,
          [TOOL_NAME]: item.name
        };
        close(open(`execute_tool ${item.name}`, parent, callAttributes, SpanKind.INTERNAL, item.start), item);
      }
    };
    this.#processor.record(runHex, spansIn(items), () => {
      const span = open(`invoke_agent ${record.agent}`, ROOT_CONTEXT, attributes, SpanKind.INTERNAL, record.start);
      const ctx = trace.setSpan(ROOT_CONTEXT, span);
      const at = hrTimeOf(record.start);
      open(RUN_START, ctx, { ...inherited, [SAMPLE_RATE]: rate }, SpanKind.INTERNAL, record.start).end(
        at
      );
      for (const [item, calls] of items) {
        if (item.type === "step") {
          const step = open(item.name, ctx, inherited, SpanKind.INTERNAL, item.start);
          const inner = trace.setSpan(ctx, step);
          for (const each of calls) call(each, inner);
          close(step, item);
        } else {
          call(item, ctx);
        }
      }
      close(span, record);
    });
  }
  #start(name, parent, attributes, kind) {
    return this.#tracer.startSpan(name, { kind, attributes }, parent);
  }
};
var UUID2 = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
function uuidHex(runId) {
  if (typeof runId !== "string" || !UUID2.test(runId) || ![32, 36].includes(runId.length)) {
    throw new TypeError("a recorded run's id must be a UUID");
  }
  const hex = runId.replaceAll("-", "").toLowerCase();
  if (/^0+$/.test(hex)) throw new TypeError("a recorded run's id must be a UUID other than the nil UUID");
  return hex;
}
function hrTimeOf(time) {
  const ms = time instanceof Date ? time.getTime() : time;
  if (typeof ms !== "number" || !Number.isFinite(ms)) {
    throw new TypeError("a recorded time must be a Date or milliseconds since the Unix epoch");
  }
  const seconds = Math.floor(ms / 1e3);
  const nanos2 = Math.round((ms - seconds * 1e3) * 1e6);
  return nanos2 >= 1e9 ? [seconds + 1, nanos2 - 1e9] : [seconds, nanos2];
}
function later(a, b) {
  return a[0] > b[0] || a[0] === b[0] && a[1] > b[1];
}
function spansIn(items) {
  return items.reduce((spans, [, calls]) => spans + 1 + calls.length, 2);
}
function read(record) {
  const inside = record.inside ?? [];
  if (!Array.isArray(inside)) {
    throw new TypeError("a recorded run's inside must be an array, in the order it ran");
  }
  const items = [];
  for (const item of inside) {
    if (item?.type === "model_call" || item?.type === "tool_call") {
      check(item, item.type);
      items.push([item, []]);
      continue;
    }
    if (item?.type !== "step") {
      throw new TypeError("a recorded item's type must be 'step', 'model_call' or 'tool_call'");
    }
    check(item, "step");
    const given = item.calls ?? [];
    if (!Array.isArray(given)) {
      throw new TypeError("a recorded step's calls must be an array, in the order they ran");
    }
    const calls = [...given];
    for (const each of calls) {
      if (each?.type !== "model_call" && each?.type !== "tool_call") {
        throw new TypeError("a step's recorded call's type must be 'model_call' or 'tool_call'");
      }
      check(each, each.type);
    }
    items.push([item, calls]);
  }
  return items;
}
var FIELDS = {
  run: [
    ["userId", "string", true],
    ["sessionId", "string", true]
  ],
  step: [["name", "string", false]],
  model_call: [
    ["model", "string", false],
    ["provider", "string", true],
    ["operation", "string", true],
    ["usage", "object", true]
  ],
  tool_call: [["name", "string", false]]
};
var OUTCOME = [
  ["errorType", "string", true],
  ["cancelled", "boolean", true]
];
var CAPS = {
  run: { userId: USER_ID_MAX, sessionId: SESSION_ID_MAX },
  step: { name: NAME_MAX },
  model_call: { model: MODEL_MAX, provider: PROVIDER_MAX },
  tool_call: { name: NAME_MAX }
};
function check(item, kind) {
  const what = kind.replace("_", " ");
  const caps = { ...CAPS[kind], errorType: ERROR_TYPE_MAX };
  const read2 = {};
  for (const [field, type, optional] of [...FIELDS[kind], ...OUTCOME]) {
    const value = item[field];
    read2[field] = value;
    if (optional && (value === void 0 || value === null)) continue;
    if (!(type === "object" ? isObject2(value) : typeof value === type)) {
      const article = type === "object" ? "an" : "a";
      throw new TypeError(`a recorded ${what}'s ${field} must be ${article} ${type}`);
    }
    if (value === "" && (kind === "step" && field === "name" || field === "model")) {
      throw new TypeError(`a recorded ${what}'s ${field} cannot be empty`);
    }
    const most = caps[field];
    if (most !== void 0 && typeof value === "string" && [...value].length > most) {
      throw new RangeError(`a recorded ${what}'s ${field} must be up to ${most} characters`);
    }
  }
  if (kind === "model_call") {
    const operation = typeof read2.operation === "string" && read2.operation.trim() !== "" ? read2.operation : "chat";
    if ([...operation].length + [...String(read2.model)].length > NAME_MAX - 1) {
      throw new RangeError(
        `a recorded model call's operation and model must be up to ${NAME_MAX - 1} characters together`
      );
    }
  }
}
function isObject2(value) {
  return Object.prototype.toString.call(value) === "[object Object]";
}
function close(span, outcome) {
  if (outcome.errorType) {
    span.setAttribute(ERROR_TYPE, outcome.errorType);
    span.setStatus({ code: SpanStatusCode.ERROR });
  }
  if (outcome.cancelled) span.setAttribute(CANCELLED, true);
  span.end(hrTimeOf(outcome.end));
}
function usageOf(usage, warnOnce) {
  const out = {};
  if (!isSet(usage)) return out;
  for (const [key, value] of [
    [INPUT_TOKENS, usage.inputTokens],
    [OUTPUT_TOKENS, usage.outputTokens],
    [CACHE_READ_INPUT_TOKENS, usage.cacheReadInputTokens],
    [CACHE_WRITE_INPUT_TOKENS, usage.cacheWriteInputTokens]
  ]) {
    if (!isSet(value)) continue;
    const count = whole(value, 0, 2 ** 63);
    if (count === void 0) {
      warnOnce(
        `usage:${key}`,
        `telmoni: ${key} must be a whole number from 0 within 64 bits; the call is sent without it`
      );
    } else {
      out[key] = count;
    }
  }
  return out;
}
function boundsOf(bounds, warnOnce) {
  const out = {};
  if (!isSet(bounds)) return out;
  const keep = (name, key, number, allowed) => {
    if (number === void 0) {
      warnOnce(`run:${name}`, `telmoni: a run's ${name} must be ${allowed}; the run is sent without it`);
    } else {
      out[key] = number;
    }
  };
  const fits2 = "a whole number from 1 to 4294967295";
  if (isSet(bounds.stallAfterSeconds)) {
    keep("stallAfterSeconds", BOUND_STALL_AFTER_S, whole(bounds.stallAfterSeconds, 1, 2 ** 32), fits2);
  }
  if (isSet(bounds.maxSteps)) keep("maxSteps", BOUND_MAX_STEPS, whole(bounds.maxSteps, 1, 2 ** 32), fits2);
  if (isSet(bounds.maxCostUsd)) {
    const cost = finite(bounds.maxCostUsd);
    const above = cost !== void 0 && cost > 0 ? cost : void 0;
    keep("maxCostUsd", BOUND_MAX_COST_USD, above, "a finite number above 0");
  }
  return out;
}
function whole(value, least, end) {
  const number = Math.trunc(numberOf(value));
  return Number.isFinite(number) && number >= least && number < end ? number : void 0;
}
function finite(value) {
  const number = numberOf(value);
  return Number.isFinite(number) ? number : void 0;
}
var DECIMAL = /^\s*[+-]?(\d+\.?\d*|\.\d+)(e[+-]?\d+)?\s*$/i;
function numberOf(value) {
  if (typeof value === "number") return value;
  if (typeof value === "bigint" || value instanceof Number) return Number(value);
  return typeof value === "string" && DECIMAL.test(value) ? Number(value) : Number.NaN;
}
function tagsOf(given, warnOnce) {
  const kept = {};
  let count = 0;
  for (const [key, value] of given) {
    if (!isSet(value)) continue;
    const sent = tagValue(value);
    const length = [...key].length;
    if (length === 0 || length > TAG_KEY_MAX || shown(sent) > TAG_VALUE_MAX) {
      warnOnce(
        "run:tag",
        "telmoni: a tag's key must be 1 to 64 characters and its value up to 256; the tag is not sent"
      );
    } else if (count === TAGS_MAX) {
      warnOnce("run:tags", "telmoni: a run carries up to 32 tags, the most ingest keeps; the rest are not sent");
    } else {
      kept[`${TAG_PREFIX}${key}`] = typeof sent === "string" ? asText(value, "tag", warnOnce) : sent;
      count += 1;
    }
  }
  return kept;
}
function tagValue(value) {
  if (typeof value === "boolean" || typeof value === "number" && Number.isFinite(value)) return value;
  return textOf2(value);
}
function shown(value) {
  if (typeof value !== "number") return [...String(value)].length;
  const [mantissa, exponent] = Math.abs(value).toExponential().split("e");
  const digits = mantissa.replace(".", "").length;
  const point = Number(exponent) + 1;
  const length = point >= digits ? point : point > 0 ? digits + 1 : 2 - point + digits;
  return length + (value < 0 ? 1 : 0);
}
function asText(value, what, warnOnce) {
  if (typeof value === "string") return value;
  warnOnce(`text:${what}`, `telmoni: a ${what} that is no string is sent as its text`);
  return textOf2(value);
}
function typeOfError(value, warnOnce) {
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null) return errorType(value);
  if (typeof value === "function" && value.name !== "") return value.name;
  return asText(value, "span's error type", warnOnce);
}
function cut(value, most, what, warnOnce) {
  if (value.length <= most) return value;
  const characters = [...value];
  if (characters.length <= most) return value;
  warnOnce(`cut:${what}`, `telmoni: a ${what} must be up to ${most} characters; it is sent cut to its first ${most}`);
  return characters.slice(0, most).join("");
}
function fits(value, most, what, warnOnce) {
  if (value.length <= most || [...value].length <= most) return true;
  warnOnce(`long:${what}`, `telmoni: a ${what} must be up to ${most} characters; the run is sent without it`);
  return false;
}
function textOf2(value) {
  try {
    return String(value);
  } catch {
    return typeof value;
  }
}
function filled(value, what, warnOnce) {
  const text = isSet(value) ? asText(value, what, warnOnce) : "";
  return text === "" ? void 0 : text;
}
function readable([seconds, nanos2]) {
  const after = seconds > 0 || seconds === 0 && nanos2 > 0;
  const within2 = seconds < 18446744073 || seconds === 18446744073 && nanos2 < 709551616;
  return after && within2;
}
function startTimeOf(span) {
  const start = span.startTime;
  return Array.isArray(start) ? start : void 0;
}
function asJson(value) {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, (_key, item) => typeof item === "bigint" ? String(item) : item) ?? String(value);
  } catch {
    return String(value);
  }
}
function isSet(value) {
  return value !== null && value !== void 0;
}
function isPromiseLike2(value) {
  return typeof value === "object" && value !== null && typeof value.then === "function";
}
var RecordingSampler = class {
  #root;
  // The api gives no way to read the application's provider's sampler, as
  // Python's does; without one given, a root run samples, as an application's
  // default ParentBased(AlwaysOn) would.
  constructor(root) {
    this.#root = root ?? new AlwaysOnSampler();
  }
  shouldSample(context3, traceId, spanName, spanKind, attributes, links) {
    const parent = trace.getSpanContext(context3);
    if (parent !== void 0 && isSpanContextValid(parent)) {
      const sampled = (parent.traceFlags & TraceFlags.SAMPLED) !== 0;
      const result2 = { decision: recording(sampled) };
      if (parent.traceState !== void 0) result2.traceState = parent.traceState;
      return result2;
    }
    const decision = this.#root.shouldSample(context3, traceId, spanName, spanKind, attributes, links);
    const result = {
      decision: recording(decision.decision === SamplingDecision2.RECORD_AND_SAMPLED)
    };
    if (decision.attributes !== void 0) result.attributes = decision.attributes;
    if (decision.traceState !== void 0) result.traceState = decision.traceState;
    return result;
  }
  toString() {
    return "TelmoniRecordingSampler";
  }
};
function recording(sampled) {
  return sampled ? SamplingDecision2.RECORD_AND_SAMPLED : SamplingDecision2.RECORD;
}
var DEFAULT_ENDPOINT = "https://api.telmoni.com";
var WHITE_SPACE = new Set("	\n\v\f\r \x85\xA0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u2028\u2029\u202F\u205F\u3000");
function trimTail(value) {
  let end = value.length;
  while (end > 0 && (value.charAt(end - 1) === "/" || WHITE_SPACE.has(value.charAt(end - 1)))) end--;
  return value.slice(0, end);
}
function trimEnds(value) {
  let start = 0;
  while (start < value.length && WHITE_SPACE.has(value.charAt(start))) start++;
  let end = value.length;
  while (end > start && WHITE_SPACE.has(value.charAt(end - 1))) end--;
  return value.slice(start, end);
}
function unsetIfBlank(value) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : void 0;
}
var PRINTABLE = /^[\x21-\x7e]*$/;
var NAME = /^[A-Za-z0-9._-]+$/;
var PATH = /^[A-Za-z0-9\-._~!$&'()*+,;=:@/]*$/;
var IPV6 = /^[0-9A-Fa-f:.]+$/;
var PORT = /^(:\d{0,5})?$/;
var LOOPBACK = new BlockList();
LOOPBACK.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK.addAddress("::1", "ipv6");
function hostOf(endpoint) {
  const scheme = endpoint.indexOf("://");
  if (!PRINTABLE.test(endpoint) || scheme < 0 || !/^https?$/i.test(endpoint.slice(0, scheme))) return void 0;
  const rest = endpoint.slice(scheme + 3);
  const slash = rest.indexOf("/");
  const authority = slash < 0 ? rest : rest.slice(0, slash);
  const path = slash < 0 ? "" : rest.slice(slash + 1);
  if (!PATH.test(path) || path.split("/").some((segment) => segment === "." || segment === "..")) return void 0;
  let host;
  let port;
  if (authority.startsWith("[")) {
    const end = authority.indexOf("]") + 1;
    host = authority.slice(0, end);
    port = authority.slice(end);
    const inner = host.slice(1, -1);
    if (end === 0 || !IPV6.test(inner) || !isIPv6(inner)) return void 0;
  } else {
    const colon = authority.indexOf(":");
    host = colon < 0 ? authority : authority.slice(0, colon);
    port = colon < 0 ? "" : authority.slice(colon);
    const labels = host.replace(/\.$/, "").split(".");
    if (!NAME.test(host) || !labels.every(labelOk) || numbered(host) && !isIPv4(host)) return void 0;
  }
  return portOk(port) ? host : void 0;
}
function labelOk(label) {
  return label.length > 0 && label.length <= 63 && !label.startsWith("-") && !label.endsWith("-");
}
function portOk(port) {
  if (!PORT.test(port)) return false;
  if (port.length <= 1) return true;
  const number = Number(port.slice(1));
  return number > 0 && number <= 65535;
}
function numbered(host) {
  const last = host.replace(/\.$/, "").split(".").pop() ?? "";
  return /^\d+$/.test(last) || /^0x[0-9a-f]*$/i.test(last);
}
function isThisMachine(host) {
  if (host.startsWith("[")) return LOOPBACK.check(host.slice(1, -1), "ipv6");
  if (isIPv4(host)) return LOOPBACK.check(host, "ipv4");
  const name = host.toLowerCase();
  return name === "localhost" || name.endsWith(".localhost");
}
function bypassesProxy(endpoint) {
  const host = hostOf(endpoint);
  return host !== void 0 && isThisMachine(host);
}
function endpointOf(given) {
  const text = trimEnds(given ?? "");
  const scheme = text.indexOf("://");
  if (scheme >= 0) return text.slice(0, scheme + 3) + trimTail(text.slice(scheme + 3));
  const endpoint = trimTail(text);
  if (endpoint === "") return DEFAULT_ENDPOINT;
  if (/^https?$/i.test(endpoint.split(/[:/]/, 1)[0] ?? "")) return endpoint;
  const host = hostOf(`http://${endpoint}`);
  const local = host !== void 0 && isThisMachine(host);
  return `${local ? "http" : "https"}://${endpoint}`;
}
function checkEndpoint(endpoint) {
  const host = hostOf(endpoint);
  if (host === void 0) throw new TypeError("the endpoint must be an http:// or https:// URL");
  if (endpoint.slice(0, 7).toLowerCase() === "http://" && !isThisMachine(host)) {
    throw new TypeError(`refusing to send the API key over unencrypted HTTP to '${host}'; use HTTPS`);
  }
}
function resolve(config) {
  const endpoint = endpointOf(config?.endpoint);
  checkEndpoint(endpoint);
  const sampleRate = config?.sampleRate ?? 1;
  if (typeof sampleRate !== "number" || !(sampleRate > 0 && sampleRate <= 1)) {
    throw new RangeError("sampleRate must be a number above 0 and up to 1");
  }
  const resolved = {
    endpoint,
    organizationId: unsetIfBlank(config?.organizationId),
    captureContent: config?.captureContent ?? false,
    sampleRate,
    sampler: config?.sampler,
    environment: unsetIfBlank(config?.environment),
    release: unsetIfBlank(config?.release)
  };
  Object.defineProperty(resolved, "apiKey", { value: unsetIfBlank(config?.apiKey), enumerable: false });
  return Object.freeze(resolved);
}
var Telmoni = class _Telmoni {
  config;
  #exporter;
  #processor;
  #provider;
  #opener;
  constructor(config, hooks) {
    this.config = resolve(config);
    const warn = hooks?.warn ?? ((message) => console.warn(message));
    this.#exporter = new Exporter(this.config, {
      transport: hooks?.transport ?? (bypassesProxy(this.config.endpoint) ? directTransport : fetchTransport),
      sleep: hooks?.sleep ?? realSleep,
      warn
    });
    this.#processor = new Processor(this.#exporter, warn, hooks?.processor);
    const ids = new Ids();
    this.#provider = new BasicTracerProvider({
      resource: resourceFromAttributes({
        [DISTRO_NAME]: DISTRO,
        "telemetry.distro.version": VERSION3
      }),
      sampler: new RecordingSampler(this.config.sampler),
      spanLimits: {
        attributeCountLimit: 128,
        attributeValueLengthLimit: Infinity,
        eventCountLimit: 0,
        linkCountLimit: 0,
        attributePerEventCountLimit: 0,
        attributePerLinkCountLimit: 0
      },
      generalLimits: { attributeCountLimit: 128, attributeValueLengthLimit: Infinity },
      idGenerator: ids,
      spanProcessors: [this.#processor]
    });
    this.#opener = new Opener(
      this.#provider.getTracer(SCOPE, VERSION3),
      this.#processor,
      this.config,
      ids,
      (key, text) => this.#exporter.warnOnce(key, text)
    );
  }
  /**
   * Initializes a Telmoni client automatically from environment variables:
   * - `TELMONI_ENDPOINT`
   * - `TELMONI_API_KEY`
   * - `TELMONI_ORG`
   * - `TELMONI_ENVIRONMENT` and `TELMONI_RELEASE`, the deployment it names
   *
   * A blank value is unset, as the CLI reads them. No `OTEL_*` variable is
   * read: the SDK's tracer provider is built part by part.
   */
  static fromEnv(hooks) {
    const env = typeof process !== "undefined" ? process.env : void 0;
    return new _Telmoni(
      {
        endpoint: env?.["TELMONI_ENDPOINT"],
        apiKey: env?.["TELMONI_API_KEY"],
        organizationId: env?.["TELMONI_ORG"],
        environment: env?.["TELMONI_ENVIRONMENT"],
        release: env?.["TELMONI_RELEASE"]
      },
      hooks
    );
  }
  /** The project's content mode, learned from the first answer. */
  get contentMode() {
    return this.#exporter.contentMode;
  }
  run(agent, a, b) {
    const [options, fn] = split(a, b);
    return within(this.#opener.run(agent, options ?? {}), fn);
  }
  wrap(agent, a, b) {
    const [options, fn] = split(a, b);
    const wrapped = (...args) => this.run(agent, options ?? {}, (run) => fn(...args, run));
    Object.defineProperty(wrapped, "name", { value: fn.name, configurable: true });
    return wrapped;
  }
  /**
   * Send a run that has already ended, as the live calls would have; a record
   * ingest would refuse, or the queue has no room for, throws, sending nothing.
   */
  recordRun(record) {
    this.#opener.record(record);
  }
  /**
   * Writes into `headers` what the next service continues the run from: the
   * W3C `traceparent` of the span current inside the run, and the run's id
   * and agent as the W3C `baggage` members `telmoni.run_id` and
   * `telmoni.agent`, beside whatever members the headers hold. The span is
   * `from`'s — a run, a step or a call — or, without one, the active
   * context's, which an application running OpenTelemetry's context manager
   * carries into callbacks. Outside a run, or for a run sampled out, it
   * writes nothing.
   */
  inject(headers, from) {
    const ctx = from?.context ?? context.active();
    const run = currentRun(ctx);
    if (run === void 0 || run.sampledOut) return;
    const span = trace.getSpanContext(ctx);
    if (span === void 0 || !isSpanContextValid(span)) return;
    writeHeaders(headers, span, run.runId, run.agent);
  }
  /**
   * The run `headers` name, continued here: its steps and calls take the
   * caller's span as their parent and carry the caller's run, so the trace
   * shows the work where it was asked for. Nothing ends a continued run
   * here; the caller's own span does. Undefined for headers that name no
   * run.
   */
  extract(headers) {
    const read2 = readHeaders(headers);
    if (read2 === void 0) return void 0;
    return this.#opener.continued(read2.spanContext, read2.runId, read2.agent);
  }
  /** Send everything queued; true once the platform has it, false past the timeout. */
  async flush(timeoutSeconds = 30) {
    let timer;
    const expired = new Promise((resolve2) => {
      timer = setTimeout(() => resolve2(false), timeoutSeconds * 1e3);
    });
    try {
      return await Promise.race([this.#processor.forceFlush().then(() => true), expired]);
    } finally {
      clearTimeout(timer);
    }
  }
  /** Flush, then stop the exporter; call it before the process exits. */
  shutdown() {
    return this.#provider.shutdown();
  }
};

export {
  Telmoni
};

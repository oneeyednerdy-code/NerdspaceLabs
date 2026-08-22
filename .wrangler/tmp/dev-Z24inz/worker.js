var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// functions/api/twitchtracker-summary.js
var CHANNEL_RE = /^[a-z0-9_]{1,25}$/;
var UPSTREAM = "https://twitchtracker.com/api/channels/summary/";
function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status === 200 ? "public, max-age=300" : "no-store",
      ...extraHeaders
    }
  });
}
__name(json, "json");
async function onRequestGet(context) {
  const channel = new URL(context.request.url).searchParams.get("channel")?.trim().toLowerCase() || "";
  if (!CHANNEL_RE.test(channel)) return json({ error: "Invalid Twitch channel login." }, 400);
  try {
    const upstream = await fetch(`${UPSTREAM}${encodeURIComponent(channel)}`, {
      headers: {
        Accept: "application/json",
        // TwitchTracker has historically rejected some generic server-side clients.
        // A normal UA improves compatibility without sending the user's Twitch token.
        "User-Agent": "Mozilla/5.0 (compatible; Wormhole/0.0.91; +https://wormhole.nerdspacelabs.com)"
      },
      cf: { cacheTtl: 300, cacheEverything: true }
    });
    if (!upstream.ok) return json({ error: "TwitchTracker did not return channel data." }, upstream.status === 404 ? 404 : 502);
    const data = await upstream.json();
    return json(data, 200, { "x-wormhole-data-source": "twitchtracker" });
  } catch {
    return json({ error: "TwitchTracker is temporarily unavailable." }, 502);
  }
}
__name(onRequestGet, "onRequestGet");

// functions/api/twitchtracker-game-summary.js
var GAME_RE = /^[a-zA-Z0-9 _:'+.&!()-]{1,120}$/;
var UPSTREAM2 = "https://twitchtracker.com/api/games/summary/";
function json2(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": status === 200 ? "public, max-age=900" : "no-store" } });
}
__name(json2, "json");
async function onRequestGet2(context) {
  const game = (new URL(context.request.url).searchParams.get("game") || "").trim();
  if (!GAME_RE.test(game)) return json2({ error: "Invalid game id or name." }, 400);
  try {
    const r = await fetch(UPSTREAM2 + encodeURIComponent(game), { headers: { Accept: "application/json", "User-Agent": "Mozilla/5.0 (compatible; NerdspaceLabs/1.10.2)" }, cf: { cacheTtl: 900, cacheEverything: true } });
    if (!r.ok) return json2({ error: "TwitchTracker did not return game data." }, r.status === 404 ? 404 : 502);
    return json2(await r.json());
  } catch {
    return json2({ error: "TwitchTracker game context is temporarily unavailable." }, 502);
  }
}
__name(onRequestGet2, "onRequestGet");

// worker.js
var HELIX_ORIGIN = "https://api.twitch.tv";
var PREFIX = "/api/twitch/helix";
var ALLOWED = /* @__PURE__ */ new Set([
  "/users",
  "/streams",
  "/streams/followed",
  "/channels",
  "/channels/followed",
  "/games",
  "/videos",
  "/clips",
  "/schedule",
  "/teams/channel",
  "/search/categories",
  "/channels/followers"
]);
function error(message, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}
__name(error, "error");
async function proxy(request, env) {
  const incoming = new URL(request.url);
  const path = incoming.pathname.slice(PREFIX.length) || "/";
  if (!ALLOWED.has(path)) return error("Unsupported Twitch API endpoint.", 404);
  if (!["GET"].includes(request.method)) return error("Method not allowed.", 405);
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return error("Twitch authorization is required.", 401);
  const clientId = env.TWITCH_CLIENT_ID;
  if (!clientId || clientId.includes("REPLACE_")) return error("Twitch Client ID is not configured.", 500);
  const upstream = new URL("/helix" + path, HELIX_ORIGIN);
  upstream.search = incoming.search;
  try {
    const response = await fetch(upstream, {
      headers: {
        authorization,
        "client-id": clientId,
        accept: "application/json"
      }
    });
    const headers = new Headers({
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store"
    });
    for (const h of ["ratelimit-limit", "ratelimit-remaining", "ratelimit-reset"]) {
      const v = response.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(response.body, { status: response.status, headers });
  } catch {
    return error("Twitch API is temporarily unavailable.", 502);
  }
}
__name(proxy, "proxy");
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname.startsWith(PREFIX + "/")) return proxy(request, env);
    if (url.pathname === "/api/twitchtracker-game-summary") {
      if (request.method !== "GET") return error("Method not allowed.", 405);
      return onRequestGet2({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
    }
    if (url.pathname === "/api/twitchtracker-summary") {
      if (request.method !== "GET") return error("Method not allowed.", 405);
      return onRequestGet({ request, env, waitUntil: ctx.waitUntil.bind(ctx) });
    }
    return env.ASSETS.fetch(request);
  }
};

// node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error2 = reduceError(e);
    const body = JSON.stringify(error2);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-9uAydi/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-9uAydi/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map

// Issue #83 regression tests:
// 1. Race condition: in-flight TP.sync() resolving after signOut() must not restore the user
// 2. Failed signOut() from server is reported, falls back to local signOut, and sweeps local session tokens
// 3. Multi-tab SIGNED_OUT auth event and storage event clear local user and update UI
// 4. Stale header account rendered from localStorage is cleanly replaced with sign-in link after sync with no live session
// 5. clearLocalAccount() safely removes user, bookings, reviews, and Supabase tokens while preserving unrelated keys

import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const root = new URL("../", import.meta.url);
const authCode = fs.readFileSync(new URL("auth.js", root), "utf8");
const apiCode = fs.readFileSync(new URL("api.js", root), "utf8");

function createMockEnvironment(options = {}) {
  const storage = new Map(Object.entries(options.initialStorage || {}));
  const listeners = { storage: [], DOMContentLoaded: [] };
  const authListeners = [];

  const localStorage = {
    getItem: k => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: k => storage.delete(k),
    clear: () => storage.clear(),
    key: i => Array.from(storage.keys())[i] || null,
    get length() { return storage.size; }
  };

  const sessionStorage = {
    getItem: () => null,
    setItem: () => {},
    removeItem: () => {}
  };

  let inner = options.initialInner || '<span class="avatar"></span>';
  const classes = new Set();
  if (options.initialClasses) options.initialClasses.forEach(c => classes.add(c));

  const dom = {
    signoutBtn: null,
    signoutNote: null,
    reloaded: false
  };

  const actionsEl = {
    classList: {
      add: c => classes.add(c),
      remove: c => classes.delete(c),
      contains: c => classes.has(c),
      toggle: (c, v) => (v ? classes.add(c) : classes.delete(c))
    },
    get outerHTML() {
      const cls = classes.size ? ' class="' + Array.from(classes).join(" ") + '"' : "";
      return "<div" + cls + ">" + inner + "</div>";
    },
    querySelectorAll: (sel) => {
      if (sel === ".dash-link") {
        if (inner.includes("dash-link")) {
          return [{ remove: () => { inner = inner.replace(/<a[^>]*dash-link[^>]*>[\s\S]*?<\/a>/g, ""); } }];
        }
      }
      return [];
    },
    querySelector: (sel) => {
      if (sel === ".dash-link") {
        if (!inner.includes("dash-link")) return null;
        return {
          set innerHTML(val) { inner = inner.replace(/<a class="dash-link">[\s\S]*?<\/a>/, '<a class="dash-link">' + val + "</a>"); },
          setAttribute: () => {},
          remove: () => { inner = inner.replace(/<a[^>]*dash-link[^>]*>[\s\S]*?<\/a>/g, ""); }
        };
      }
      if (sel === ".acct") {
        if (!inner.includes('class="acct"')) return null;
        return {
          tagName: "DETAILS",
          set outerHTML(val) { inner = inner.replace(/<details class="acct">[\s\S]*?<\/details>/, val); },
          insertAdjacentHTML: (pos, html) => { if (pos === "beforebegin") inner = html + inner; },
          contains: () => false,
          querySelector: () => ({ focus: () => {} })
        };
      }
      if (sel === ".signin-link") {
        if (!inner.includes("signin-link")) return null;
        return {
          tagName: "A",
          set outerHTML(val) { inner = inner.replace(/<a[^>]*signin-link[^>]*>[\s\S]*?<\/a>/, val); },
          insertAdjacentHTML: (pos, html) => { if (pos === "beforebegin") inner = html + inner; },
          addEventListener: () => {}
        };
      }
      if (sel === ".avatar:not(.acct summary)" || sel === ".avatar") {
        if (!inner.includes('class="avatar"') || inner.includes('<details class="acct"')) return null;
        return {
          tagName: "SPAN",
          set outerHTML(val) { inner = inner.replace(/<span[^>]*avatar[^>]*>[\s\S]*?<\/span>/, val); },
          insertAdjacentHTML: (pos, html) => { if (pos === "beforebegin") inner = html + inner; },
          remove: () => { inner = inner.replace(/<span[^>]*avatar[^>]*>[\s\S]*?<\/span>/, ""); }
        };
      }
      return null;
    }
  };

  const documentMock = {
    addEventListener: (ev, fn) => {
      if (listeners[ev]) listeners[ev].push(fn);
    },
    querySelectorAll: () => [],
    querySelector: (sel) => {
      if (sel === ".header-actions") return actionsEl;
      if (sel === ".acct") return actionsEl.querySelector(".acct");
      if (sel === ".signin-link") return actionsEl.querySelector(".signin-link");
      return null;
    },
    getElementById: (id) => {
      if (id === "signout") {
        if (!dom.signoutBtn) {
          dom.signoutBtn = {
            disabled: false,
            textContent: "Sign out",
            title: "",
            parentElement: { appendChild: (child) => { dom.signoutNote = child; } },
            addEventListener: (ev, fn) => { dom.signoutClickHandler = fn; }
          };
        }
        return dom.signoutBtn;
      }
      return null;
    },
    createElement: (tag) => ({ tagName: tag.toUpperCase(), className: "", textContent: "" })
  };

  const windowMock = {
    addEventListener: (ev, fn) => {
      if (listeners[ev]) listeners[ev].push(fn);
    },
    TRAILPEAK_SUPABASE: { url: "https://example.supabase.co", anonKey: "anon-test" }
  };

  const locationMock = {
    pathname: "/index.html",
    hash: "",
    search: "",
    href: "https://trailpeak.test/index.html",
    replace: () => {},
    reload: () => { dom.reloaded = true; }
  };

  const warnLogs = [];
  const consoleMock = {
    log: () => {},
    warn: (...args) => { warnLogs.push(args.join(" ")); },
    error: (...args) => { warnLogs.push(args.join(" ")); }
  };

  const context = vm.createContext({
    URL,
    URLSearchParams,
    console: consoleMock,
    localStorage,
    sessionStorage,
    document: documentMock,
    window: windowMock,
    location: locationMock,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Promise
  });

  return { context, storage, dom, actionsEl, listeners, authListeners, warnLogs };
}

// ---------------------------------------------------------------------------
// TEST 1: clearLocalAccount sweeps all user data and supabase auth tokens
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u1", name: "Hiker One" }),
      "trailpeak.bookings": JSON.stringify([{ ref: "B1" }]),
      "trailpeak.reviews": JSON.stringify([{ ref: "B1", stars: 5 }]),
      "sb-xyz-auth-token": "token-secret",
      "sb-xyz-auth-token-refresh": "refresh-secret",
      "supabase.auth.token": "old-token",
      "unrelated_key": "keep_me"
    }
  });

  vm.runInContext(authCode, env.context);
  vm.runInContext("clearLocalAccount()", env.context);

  assert.equal(env.storage.has("trailpeak.user"), false, "trailpeak.user removed");
  assert.equal(env.storage.has("trailpeak.bookings"), false, "trailpeak.bookings removed");
  assert.equal(env.storage.has("trailpeak.reviews"), false, "trailpeak.reviews removed");
  assert.equal(env.storage.has("sb-xyz-auth-token"), false, "sb- token removed");
  assert.equal(env.storage.has("sb-xyz-auth-token-refresh"), false, "sb- refresh token removed");
  assert.equal(env.storage.has("supabase.auth.token"), false, "supabase auth token removed");
  assert.equal(env.storage.get("unrelated_key"), "keep_me", "unrelated keys preserved");
  console.log("PASS: clearLocalAccount sweeps tokens and user caches, keeps unrelated storage");
}

// ---------------------------------------------------------------------------
// TEST 2: Race condition - TP.sync() in flight when signOut() called
//         Must NOT restore the account into localStorage when sync finishes
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u1", name: "Active Hiker" }),
      "sb-token": "jwt"
    }
  });

  vm.runInContext(authCode, env.context);

  let resolveTrips;
  const tripsPromise = new Promise(r => { resolveTrips = r; });

  const mockDb = {
    auth: {
      getSession: async () => ({
        data: {
          session: {
            user: { id: "u1", email: "hiker@test.com" }
          }
        }
      }),
      signOut: async () => ({ error: null }),
      onAuthStateChange: (cb) => { env.authListeners.push(cb); }
    },
    from: () => ({
      select: () => ({
        order: () => tripsPromise,
        eq: () => ({
          single: async () => ({ data: { id: "u1", name: "Active Hiker", role: "joiner" } }),
          order: async () => ({ data: [{ ref: "B-100", trip_id: "t1", date: "2026-12-01", size: 1, dp: 500, balance: 1000 }] })
        })
      })
    }),
    rpc: (name) => {
      if (name === "all_slots") return Promise.resolve({ data: [] });
      if (name === "all_reviews") return Promise.resolve({ data: [] });
      if (name === "expire_holds") return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    }
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  const syncPromise = vm.runInContext("TP.sync({ reload: false })", env.context);

  assert.equal(env.storage.has("trailpeak.user"), true, "User was present before signout");
  await vm.runInContext("signOut()", env.context);

  assert.equal(env.storage.has("trailpeak.user"), false, "User removed immediately by signOut");

  resolveTrips({
    data: [{ id: "t1", details: { title: "Mt Pulag" } }],
    error: null
  });

  await syncPromise;

  assert.equal(env.storage.has("trailpeak.user"), false, "User must not be restored after sign-out race");
  assert.equal(env.storage.has("trailpeak.bookings"), false, "Bookings must not be restored after sign-out race");
  assert.equal(vm.runInContext("getUser()", env.context), null, "getUser() remains null");
  console.log("PASS: in-flight TP.sync() resolving after signOut() does not restore user or bookings");
}

// ---------------------------------------------------------------------------
// TEST 3: Pre-write live session verification
//         If session disappears before write, sync discards user data
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u1", name: "Expiring Hiker" })
    }
  });

  vm.runInContext(authCode, env.context);

  let sessionCalls = 0;
  const mockDb = {
    auth: {
      getSession: async () => {
        sessionCalls++;
        if (sessionCalls === 1) {
          return { data: { session: { user: { id: "u1", email: "exp@test.com" } } } };
        }
        return { data: { session: null } };
      },
      signOut: async () => ({ error: null }),
      onAuthStateChange: () => {}
    },
    from: () => ({
      select: () => ({
        order: async () => ({ data: [] }),
        eq: () => ({
          single: async () => ({ data: { id: "u1", name: "Expiring Hiker", role: "joiner" } }),
          order: async () => ({ data: [] })
        })
      })
    }),
    rpc: () => Promise.resolve({ data: [] })
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  await vm.runInContext("TP.sync({ reload: false })", env.context);

  assert.equal(env.storage.has("trailpeak.user"), false, "Stale user removed when live session is gone");
  assert.equal(vm.runInContext("getUser()", env.context), null);
  console.log("PASS: pre-write check prevents writing user when session disappears during sync");
}

// ---------------------------------------------------------------------------
// TEST 4: signOut() error from server:
//         - Reported (not hidden as clean success)
//         - Local session fallback signOut({ scope: "local" }) called
//         - Local user and auth token cleared from storage
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u2", name: "Offline User" }),
      "sb-project-auth-token": "surviving-token"
    }
  });

  vm.runInContext(authCode, env.context);

  let localScopeCalled = false;
  const mockDb = {
    auth: {
      signOut: async (opts) => {
        if (opts && opts.scope === "local") {
          localScopeCalled = true;
          return { error: null };
        }
        return { error: new Error("Network error: server unreachable") };
      },
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {}
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
    rpc: () => Promise.resolve({ data: [] })
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  const result = await vm.runInContext("signOut()", env.context);

  assert.equal(result.ok, false, "signOut reported failure");
  assert.ok(result.error, "signOut returned error object");
  assert.match(result.error.message, /Network error/, "Error message retained");
  assert.equal(localScopeCalled, true, "Fallback local scope signOut was invoked");
  assert.equal(env.storage.has("trailpeak.user"), false, "Local user cleared even on server error");
  assert.equal(env.storage.has("sb-project-auth-token"), false, "Supabase auth token swept on server error");
  assert.ok(env.warnLogs.some(log => log.includes("Sign-out warning")), "Warning logged to console");
  assert.equal(env.dom.signoutBtn.textContent, "Signed out locally", "Button reflects local signout fallback");
  console.log("PASS: server signOut failure is reported, invokes local fallback, and clears local tokens");
}

// ---------------------------------------------------------------------------
// TEST 5: Multi-tab SIGNED_OUT auth change
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u3", name: "Tab User" }),
      "trailpeak.bookings": JSON.stringify([{ ref: "B3" }])
    }
  });

  vm.runInContext(authCode, env.context);

  let authChangeHandler = null;
  const mockDb = {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: (cb) => { authChangeHandler = cb; }
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
    rpc: () => Promise.resolve({ data: [] })
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  assert.ok(authChangeHandler, "Auth state change listener was registered");
  const initialGen = vm.runInContext("TP.authGen", env.context);

  authChangeHandler("SIGNED_OUT");

  assert.equal(env.storage.has("trailpeak.user"), false, "User removed on multi-tab SIGNED_OUT");
  assert.equal(env.storage.has("trailpeak.bookings"), false, "Bookings removed on multi-tab SIGNED_OUT");
  assert.equal(vm.runInContext("TP.authGen", env.context) > initialGen, true, "TP.authGen incremented");
  console.log("PASS: multi-tab SIGNED_OUT event clears user caches and bumps authGen");
}

// ---------------------------------------------------------------------------
// TEST 6: Multi-tab storage event on trailpeak.user removal
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "u4", name: "Storage Tab User" })
    }
  });

  vm.runInContext(authCode, env.context);
  const mockDb = {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {}
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
    rpc: () => Promise.resolve({ data: [] })
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  const initialGen = vm.runInContext("TP.authGen", env.context);
  env.storage.delete("trailpeak.user");
  env.listeners.storage.forEach(fn => fn({ key: "trailpeak.user" }));

  assert.equal(vm.runInContext("TP.authGen", env.context) > initialGen, true, "Storage event bumped authGen");
  assert.equal(vm.runInContext("getUser()", env.context), null);
  console.log("PASS: storage event clears caches and bumps authGen across tabs");
}

// ---------------------------------------------------------------------------
// TEST 7: Header account cleanup when sync finds no live session
// ---------------------------------------------------------------------------
{
  const env = createMockEnvironment({
    initialStorage: {
      "trailpeak.user": JSON.stringify({ id: "org1", name: "Maria Santos", role: "organizer", unread: 2 })
    },
    initialInner: '<span class="avatar"></span>'
  });

  vm.runInContext(authCode, env.context);

  // First render on DOM load with stale user from localStorage
  vm.runInContext("renderAccount()", env.context);
  assert.ok(env.actionsEl.classList.contains("is-organizer"), "is-organizer set initially");
  assert.ok(env.actionsEl.outerHTML.includes('class="acct"'), "account menu rendered");

  // Supabase has NO active session
  const mockDb = {
    auth: {
      signOut: async () => ({ error: null }),
      getSession: async () => ({ data: { session: null } }),
      onAuthStateChange: () => {}
    },
    from: () => ({ select: () => ({ order: async () => ({ data: [] }) }) }),
    rpc: () => Promise.resolve({ data: [] })
  };

  env.context.window.supabase = { createClient: () => mockDb };
  vm.runInContext(apiCode, env.context);

  // Sync runs on page load
  await vm.runInContext("TP.sync({ reload: false })", env.context);

  // Header must now be cleaned up to signin-link
  assert.equal(env.actionsEl.classList.contains("is-organizer"), false, "is-organizer class removed");
  assert.equal(env.actionsEl.outerHTML.includes('class="acct"'), false, "acct menu removed");
  assert.ok(env.actionsEl.outerHTML.includes("signin-link"), "signin-link shown in place of account");
  console.log("PASS: header account cleanly replaced with signin-link after sync with no live session");
}

console.log("All Issue #83 regression tests passed successfully!");

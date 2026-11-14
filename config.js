// Supabase connection for TrailPeak. URLs and publishable keys are public by design:
// the privacy rules in supabase/schema.sql protect the data. Never put a secret or
// service_role key here.
//
// Two environments (TP-061, #97):
//   live    → the real site and real data (default)
//   staging → a separate Supabase project for testing (see docs/testing/staging.md)
// Open any page with ?env=staging to switch this browser to staging, ?env=live to switch back.
// The choice is remembered in this browser. Switching clears TrailPeak's saved data here
// (account copy, bookings cache, drafts) so live and staging data never mix.
(function () {
  const ENVS = {
    live: {
      url: "https://fjssjgefufwuadrltvjf.supabase.co",
      anonKey: "sb_publishable_GH2WsVTwnp8EFGM8bOyDYw_MPeGkB8c",
    },
    staging: {
      url: "https://abndhooswfitnrixwdsz.supabase.co",   // trailpeak-staging
      anonKey: "sb_publishable_QAia1iywJNJIoYAJ5Gh6iQ_6PLTT5cK",
    },
  };
  // Sign-in buttons to show right away (no wait for Supabase). The sign-in page still checks
  // Supabase in the background and hides Google if it's turned off there. Staging has email only.
  const signInWith = { live: ["google", "email"], staging: ["email"] };

  const KEY = "trailpeak.env";
  let env = "live";
  try {
    const asked = new URLSearchParams(location.search).get("env");
    const before = localStorage.getItem(KEY) === "staging" ? "staging" : "live";
    if (asked === "staging" || asked === "live") {
      if (asked !== before) {
        for (const store of [localStorage, sessionStorage]) {
          Object.keys(store).filter(k => k.startsWith("trailpeak.") && k !== KEY).forEach(k => store.removeItem(k));
        }
      }
      if (asked === "staging") localStorage.setItem(KEY, "staging"); else localStorage.removeItem(KEY);
      env = asked;
    } else env = before;
  } catch { /* storage blocked: stay on live */ }

  window.TRAILPEAK_ENV = env;
  window.TRAILPEAK_SUPABASE = { ...ENVS[env], signInWith: signInWith[env] };

  // A bar on every staging page, so test data is never mistaken for the real site.
  if (env === "staging" && typeof document !== "undefined") {
    const ready = !!ENVS.staging.url;
    const bar = () => {
      if (document.querySelector(".env-bar")) return;
      const el = document.createElement("div");
      el.className = "env-bar";
      el.setAttribute("role", "note");
      el.innerHTML = ready
        ? 'Staging: test data only. <a href="?env=live">Switch to the live site</a>'
        : 'Staging isn\'t set up yet, so this is the offline demo. <a href="?env=live">Switch to the live site</a>';
      // After "Skip to content", which stays the first thing Tab reaches.
      const skip = document.querySelector("body > .skip");
      if (skip) skip.after(el); else document.body.prepend(el);
    };
    if (document.body) bar(); else document.addEventListener("DOMContentLoaded", bar);
  }
})();

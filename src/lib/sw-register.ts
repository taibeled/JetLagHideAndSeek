// Client-side service-worker registration with an update-available
// toast. Called once from `Layout.astro`. Safe no-op in SSR and in
// browsers without SW support.
//
// Design notes:
//   * The SW source is `src/sw.ts` and the bundled output is emitted
//     to `dist/client/sw.js` by the hand-rolled `serwistIntegration`
//     in `astro.config.mjs` (esbuild bundle + @serwist/build
//     injectManifest, in the `astro:build:done` hook). In production
//     it's a plain static asset at `<base>sw.js`. During `astro dev`
//     the integration is disabled by default — set `PUBLIC_ENABLE_SW=1`
//     to opt back in when testing offline behavior locally.
//   * Registration is scoped to `import.meta.env.BASE_URL`, which is
//     `/JetLagHideAndSeek/` on GH Pages and `/` on Railway. Matching
//     the scope to the base means the SW only controls URLs under the
//     app, which is both correct and avoids stomping on other apps
//     sharing the GH Pages domain.
//   * The update flow is user-driven: when a new SW is waiting, we
//     show a sticky toast with a "Reload" action. Clicking it posts
//     `SKIP_WAITING` to the waiting SW, which activates it and fires
//     `controllerchange`; we then `location.reload()` so the user
//     sees the new assets. This matches `src/sw.ts` where
//     `skipWaiting: false` is set — the new SW waits for our explicit
//     signal instead of activating while a game is in progress.

import { Serwist } from "@serwist/window";
import { toast } from "react-toastify";

const TOAST_ID = "sw-update-available";
const DISMISSED_WAITING_SW_KEY = "dismissedWaitingSwScriptURL";

function getDismissedWaitingScriptURL(): string | null {
    try {
        return localStorage.getItem(DISMISSED_WAITING_SW_KEY);
    } catch {
        return null;
    }
}

function setDismissedWaitingScriptURL(scriptURL: string) {
    try {
        localStorage.setItem(DISMISSED_WAITING_SW_KEY, scriptURL);
    } catch {
        // Ignore storage failures (private mode / restricted webview).
    }
}

function clearDismissedWaitingScriptURL() {
    try {
        localStorage.removeItem(DISMISSED_WAITING_SW_KEY);
    } catch {
        // Ignore storage failures (private mode / restricted webview).
    }
}

export function registerServiceWorker() {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    // In local dev, stale SW caches can keep serving old client bundles and
    // make debugging impossible. Opt-in only via PUBLIC_ENABLE_SW=1.
    const isLocalhost =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1";
    if (
        isLocalhost &&
        import.meta.env.PUBLIC_ENABLE_SW !== "1" &&
        import.meta.env.PUBLIC_ENABLE_SW !== "true"
    ) {
        return;
    }

    // `BASE_URL` can be provided with or without a trailing slash
    // depending on environment/build tooling. Normalize so URL joining
    // is always correct.
    const base = import.meta.env.BASE_URL;
    const normalizedBase = base.endsWith("/") ? base : `${base}/`;
    const scriptURL = `${normalizedBase}sw.js`;
    const scope = normalizedBase;

    // `type: "module"` matches the esbuild `format: "esm"` we use in
    // the custom Astro integration — our sw.ts uses ES imports at the
    // top level, which require an ES-module service worker on the
    // browser side.
    const sw = new Serwist(scriptURL, { scope, type: "module" });

    // Track whether the user has interacted with the page. A waiting SW
    // detected before any interaction means we're on a fresh page load —
    // safe to auto-apply the update immediately. After interaction (click,
    // keydown, touch) we show the toast instead so a mid-game session isn't
    // disrupted by a sudden reload.
    let hasUserInteracted = false;
    const onFirstInteraction = () => {
        hasUserInteracted = true;
    };
    document.addEventListener("click", onFirstInteraction, {
        once: true,
        capture: true,
    });
    document.addEventListener("keydown", onFirstInteraction, {
        once: true,
        capture: true,
    });
    document.addEventListener("touchstart", onFirstInteraction, {
        once: true,
        capture: true,
        passive: true,
    });

    let reloadingForUpdate = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloadingForUpdate) return;
        reloadingForUpdate = true;
        clearDismissedWaitingScriptURL();
        // New SW took control — reload so the freshly-precached
        // assets are picked up on the next navigation.
        window.location.reload();
    });

    // Check for a SW that was already waiting before this page loaded (e.g.
    // installed on a previous visit but skipWaiting was never called). The
    // check is initiated immediately on load but resolves asynchronously
    // (getRegistration returns a Promise), so it normally settles before the
    // user has interacted — letting us auto-apply rather than show the toast.
    // The !hasUserInteracted guard inside still protects the case where the
    // user taps before it resolves. This is the primary fix for mobile, where
    // the Serwist "waiting" event fires late, after a tap has usually landed.
    navigator.serviceWorker.getRegistration(scope).then((existing) => {
        if (existing?.waiting && !hasUserInteracted && !reloadingForUpdate) {
            reloadingForUpdate = true;
            existing.waiting.postMessage({ type: "SKIP_WAITING" });
            // controllerchange fires above → location.reload() runs.
        }
    });

    sw.addEventListener("waiting", async () => {
        // Fresh page load, no interaction yet → auto-apply the new SW so
        // users always get the latest code on open. This is the primary fix
        // for "I have to clear cache to see territory after a deployment":
        // the old SW had stale code; auto-activating the new one on the
        // next fresh open avoids that entirely.
        if (!hasUserInteracted) {
            reloadingForUpdate = true;
            sw.messageSkipWaiting();
            // controllerchange fires → location.reload() above runs.
            return;
        }

        const registration =
            await navigator.serviceWorker.getRegistration(scope);
        const waitingScriptURL = registration?.waiting?.scriptURL ?? null;

        // If the user already dismissed this exact waiting SW, do not
        // re-show the banner until a different SW build is waiting.
        if (
            waitingScriptURL &&
            getDismissedWaitingScriptURL() === waitingScriptURL
        ) {
            return;
        }

        // Mid-session: sticky toast with a manual Reload button.
        // `autoClose: false` so users in the middle of a game don't lose it.
        toast.info("A new version of the app is ready.", {
            toastId: TOAST_ID,
            autoClose: false,
            closeOnClick: false,
            draggable: false,
            onClose: () => {
                if (waitingScriptURL) {
                    setDismissedWaitingScriptURL(waitingScriptURL);
                }
            },
            onClick: () => {
                reloadingForUpdate = true;
                sw.messageSkipWaiting();
            },
            // Using data to hint the user that the entire toast is
            // clickable. Styling nudges for this live alongside the
            // rest of the toastify overrides in globals.css.
        });
    });

    sw.register()
        .then((registration) => {
            if (!registration) return;
            // Force an immediate update check after registration. Mobile
            // browsers often defer the automatic SW update check; calling
            // update() here ensures we detect a new version on every page
            // load rather than waiting for the browser's own schedule.
            registration.update().catch(() => {});
        })
        .catch((err: unknown) => {
            // We deliberately don't toast on registration failure — it
            // happens routinely in unsupported contexts (iOS private
            // browsing, some embedded webviews) and surfacing it would
            // be noise. Log for developer debugging.
            console.log("Service worker registration failed:", err);
        });
}

// Minimal hash router: #/today, #/entries, #/calendar, #/insights, #/reports, #/settings.

export const ROUTES = [
  { id: "today", label: "Today", key: "1" },
  { id: "entries", label: "Entries", key: "2" },
  { id: "calendar", label: "Calendar", key: "3" },
  { id: "insights", label: "Insights", key: "4" },
  { id: "reports", label: "Reports", key: "5" },
  { id: "settings", label: "Settings", key: "6" },
] as const;

export type RouteId = (typeof ROUTES)[number]["id"];

function current(): RouteId {
  const id = location.hash.replace(/^#\/?/, "").split("?")[0];
  return (ROUTES.find((r) => r.id === id)?.id ?? "today") as RouteId;
}

export const route = $state({ id: current() });

function apply(next: RouteId) {
  if (next === route.id) return;
  const update = () => {
    route.id = next;
  };
  // Cross-fade between views where supported; reduced motion is handled in CSS.
  const transition = document.startViewTransition?.(update);
  if (!transition) update();
  const focusHeading = () => document.querySelector<HTMLElement>("main h1")?.focus({ preventScroll: true });
  transition ? transition.finished.finally(focusHeading) : queueMicrotask(focusHeading);
}

window.addEventListener("hashchange", () => apply(current()));

export function navigate(id: RouteId) {
  location.hash = `/${id}`;
}

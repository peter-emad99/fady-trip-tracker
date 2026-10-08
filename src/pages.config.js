import { lazy } from "react";
import __Layout from "./Layout.jsx";

const loaders = {
  Dashboard: () => import("./pages/Dashboard"),
  TripDetails: () => import("./pages/TripDetails"),
  TripBudget: () => import("./pages/TripBudget"),
  Analytics: () => import("./pages/Analytics"),
  Usage: () => import("./pages/Usage"),
};

// Each page loads on first visit, so e.g. the chart and PDF code aren't in the startup bundle
export const PAGES = Object.fromEntries(
  Object.entries(loaders).map(([name, load]) => [name, lazy(load)]),
);

// Fetches every page's code ahead of time (it's then cached for offline use)
export const preloadPages = () =>
  Promise.allSettled(Object.values(loaders).map((load) => load()));

export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
  Layout: __Layout,
};

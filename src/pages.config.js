import { lazy } from "react";
import __Layout from "./Layout.jsx";

// Each page loads on first visit, so e.g. the chart and PDF code aren't in the startup bundle
export const PAGES = {
  Dashboard: lazy(() => import("./pages/Dashboard")),
  TripDetails: lazy(() => import("./pages/TripDetails")),
  TripBudget: lazy(() => import("./pages/TripBudget")),
  Usage: lazy(() => import("./pages/Usage")),
};

export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
  Layout: __Layout,
};

import Dashboard from "./pages/Dashboard";
import TripDetails from "./pages/TripDetails";
import TripBudget from "./pages/TripBudget";
import __Layout from "./Layout.jsx";

export const PAGES = {
  Dashboard: Dashboard,
  TripDetails: TripDetails,
  TripBudget: TripBudget,
};

export const pagesConfig = {
  mainPage: "Dashboard",
  Pages: PAGES,
  Layout: __Layout,
};

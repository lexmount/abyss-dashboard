import { Navigate } from "react-router-dom";
// Pages load with the app rather than on demand: a lazy page suspends its
// first render, and React then holds the page back for its fallback before
// any data request starts, which cost every visit about 300 ms.
import Dashboard from "@/app/dashboard/page";
import NotFound from "@/app/not-found/page";
import Sessions from "@/app/sessions/page";
import SessionDetail from "@/app/sessions/detail-page";

export interface RouteConfig {
  path: string;
  element: React.ReactNode;
  children?: RouteConfig[];
}

export const routes: RouteConfig[] = [
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: "/dashboard",
    element: <Dashboard />,
  },
  {
    path: "/sessions",
    element: <Sessions />,
  },
  {
    path: "/sessions/:sessionPk",
    element: <SessionDetail />,
  },
  {
    path: "*",
    element: <NotFound />,
  },
];

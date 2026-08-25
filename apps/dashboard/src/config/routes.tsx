import { lazy } from "react";
import { Navigate } from "react-router-dom";

const Dashboard = lazy(() => import("@/app/dashboard/page"));
const NotFound = lazy(() => import("@/app/not-found/page"));
const Sessions = lazy(() => import("@/app/sessions/page"));
const SessionDetail = lazy(() => import("@/app/sessions/detail-page"));

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

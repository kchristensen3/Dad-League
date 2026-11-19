import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Navigate, Outlet, RouterProvider, createBrowserRouter, useLocation } from "react-router";
import { ApiError } from "./api";
import { Spinner } from "./components/ui";
import { useMe } from "./hooks";
import "./index.css";
import Board from "./pages/Board";
import Chat from "./pages/Chat";
import EventDetail from "./pages/EventDetail";
import Home from "./pages/Home";
import Ideas from "./pages/Ideas";
import Join from "./pages/Join";
import LeagueLayout from "./pages/LeagueLayout";
import LeaguePage from "./pages/LeaguePage";
import Leagues, { RootRedirect } from "./pages/Leagues";
import Login from "./pages/Login";
import Profile from "./pages/Profile";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
    },
  },
});

function RequireAuth() {
  const { data: me, isLoading } = useMe();
  const location = useLocation();
  if (isLoading) return <Spinner className="pt-32" />;
  if (!me) return <Navigate to={`/login?returnTo=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  return <Outlet />;
}

const router = createBrowserRouter([
  { path: "/login", element: <Login /> },
  { path: "/join/:code", element: <Join /> },
  {
    element: <RequireAuth />,
    children: [
      { path: "/", element: <RootRedirect /> },
      { path: "/leagues", element: <Leagues /> },
      { path: "/me", element: <Profile /> },
      {
        path: "/l/:leagueId",
        element: <LeagueLayout />,
        children: [
          { index: true, element: <Home /> },
          { path: "events/:eventId", element: <EventDetail /> },
          { path: "ideas", element: <Ideas /> },
          { path: "board", element: <Board /> },
          { path: "chat", element: <Chat /> },
          { path: "league", element: <LeaguePage /> },
        ],
      },
    ],
  },
  { path: "*", element: <Navigate to="/" replace /> },
]);

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => {});
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  </StrictMode>,
);

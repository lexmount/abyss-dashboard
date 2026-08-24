import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter as Router } from "react-router-dom";
import { AppRouter } from "@/components/router/app-router";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/contexts/i18n-context";
import { SidebarConfigProvider } from "@/contexts/sidebar-context";

const basename = import.meta.env.VITE_BASENAME || "";
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      retry: 1,
      staleTime: 15_000,
    },
  },
});

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="font-sans antialiased">
        <I18nProvider>
          <ThemeProvider defaultTheme="system" storageKey="abyss-ui-theme">
            <SidebarConfigProvider>
              <Router basename={basename}>
                <AppRouter />
              </Router>
            </SidebarConfigProvider>
          </ThemeProvider>
        </I18nProvider>
      </div>
    </QueryClientProvider>
  );
}

export default App;

"use client";

import * as React from "react";
import { ModeToggleButton } from "@lexmount.com/abyss-ui";
import { useTheme } from "@/hooks/use-theme";
import { useCircularTransition } from "@/hooks/use-circular-transition";

interface ModeToggleProps {
  variant?: "outline" | "ghost" | "default";
}

export function ModeToggle({ variant = "outline" }: ModeToggleProps) {
  const { theme } = useTheme();
  const { toggleTheme } = useCircularTransition();

  // Simple, reliable dark mode detection with re-sync
  const [isDarkMode, setIsDarkMode] = React.useState(false);

  React.useEffect(() => {
    const updateMode = () => {
      if (theme === "dark") {
        setIsDarkMode(true);
      } else if (theme === "light") {
        setIsDarkMode(false);
      } else {
        setIsDarkMode(window.matchMedia("(prefers-color-scheme: dark)").matches);
      }
    };

    updateMode();

    // Listen for system theme changes
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    mediaQuery.addEventListener("change", updateMode);

    return () => mediaQuery.removeEventListener("change", updateMode);
  }, [theme]);

  const handleToggle = (event: React.MouseEvent<HTMLButtonElement>) => {
    toggleTheme(event);
  };

  return (
    <ModeToggleButton
      variant={variant}
      isDarkMode={isDarkMode}
      onClick={handleToggle}
    />
  );
}

import type * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "./button";

export interface ModeToggleButtonProps {
  isDarkMode: boolean;
  onClick: React.MouseEventHandler<HTMLButtonElement>;
  variant?: "outline" | "ghost" | "default";
  switchToLightLabel?: string;
  switchToDarkLabel?: string;
}

export function ModeToggleButton({
  isDarkMode,
  onClick,
  variant = "outline",
  switchToLightLabel = "Switch to light mode",
  switchToDarkLabel = "Switch to dark mode",
}: ModeToggleButtonProps) {
  return (
    <Button
      variant={variant}
      size="icon"
      onClick={onClick}
      className="mode-toggle-button relative cursor-pointer overflow-hidden"
    >
      {isDarkMode ? (
        <Sun className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-transform duration-300" />
      ) : (
        <Moon className="h-[1.2rem] w-[1.2rem] scale-100 rotate-0 transition-transform duration-300" />
      )}
      <span className="sr-only">
        {isDarkMode ? switchToLightLabel : switchToDarkLabel}
      </span>
    </Button>
  );
}

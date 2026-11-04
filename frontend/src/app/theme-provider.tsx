"use client";

import { CssBaseline } from "@mui/material";
import { createTheme, ThemeProvider as MuiThemeProvider } from "@mui/material/styles";
import type { ReactNode } from "react";

const theme = createTheme({
  colorSchemes: {
    light: true,
    dark: true,
  },
  cssVariables: true,
  typography: {
    fontFamily: "var(--font-geist-sans), sans-serif",
  },
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <MuiThemeProvider theme={theme}>
      <CssBaseline />
      {children}
    </MuiThemeProvider>
  );
}
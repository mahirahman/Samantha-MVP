"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { getSupabaseClient } from "@/lib/supabase";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    let isActive = true;

    async function routeBySession() {
      try {
        const { data, error } = await getSupabaseClient().auth.getUser();

        if (isActive) {
          router.replace(!error && data.user ? "/dashboard" : "/login");
        }
      } catch {
        if (isActive) {
          router.replace("/login");
        }
      }
    }

    void routeBySession();

    return () => {
      isActive = false;
    };
  }, [router]);

  return (
    <Box
      component="main"
      sx={{ minHeight: "100vh", display: "grid", placeItems: "center" }}
    >
      <CircularProgress aria-label="Checking sign-in status" />
    </Box>
  );
}

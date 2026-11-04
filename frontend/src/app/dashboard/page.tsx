"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { getSupabaseClient } from "@/lib/supabase";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let isActive = true;

    async function loadUser() {
      try {
        const { data, error } = await getSupabaseClient().auth.getUser();

        if (error || !data.user) {
          router.replace("/login");
          return;
        }

        if (isActive) {
          setEmail(data.user.email ?? "");
        }
      } catch (error) {
        if (isActive) {
          setErrorMessage(
            error instanceof Error ? error.message : "Unable to load your account.",
          );
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadUser();
    return () => {
      isActive = false;
    };
  }, [router]);

  async function handleSignOut() {
    try {
      const { error } = await getSupabaseClient().auth.signOut();

      if (error) {
        setErrorMessage(error.message);
        return;
      }

      router.replace("/login");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign out.",
      );
    }
  }

  return (
    <Box component="main" sx={{ maxWidth: 760, mx: "auto", px: 2, py: { xs: 5, sm: 8 } }}>
      {isLoading ? (
        <Box sx={{ display: "grid", minHeight: 240, placeItems: "center" }}>
          <CircularProgress aria-label="Loading account" />
        </Box>
      ) : (
        <Paper variant="outlined" sx={{ p: { xs: 3, sm: 4 }, borderRadius: 2 }}>
          <Stack spacing={2}>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Your Care GP account
            </Typography>
            {email && <Typography color="text.secondary">Signed in as {email}</Typography>}
            {errorMessage && <Alert severity="error">{errorMessage}</Alert>}
            <Box>
              <Button variant="outlined" onClick={handleSignOut}>
                Sign out
              </Button>
            </Box>
          </Stack>
        </Paper>
      )}
    </Box>
  );
}
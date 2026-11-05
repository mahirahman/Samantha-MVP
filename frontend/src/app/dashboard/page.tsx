"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Alert from "@mui/material/Alert";
import CircularProgress from "@mui/material/CircularProgress";
import { getSupabaseClient } from "@/lib/supabase";
import { DocumentWorkspace } from "./document-workspace";

export default function DashboardPage() {
  const router = useRouter();
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
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
          setUserId(data.user.id);
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

  if (!isLoading && !userId && errorMessage) {
    return <Alert severity="error">{errorMessage}</Alert>;
  }

  if (isLoading || !userId) {
    return (
      <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}>
        <CircularProgress aria-label="Loading account" />
      </Box>
    );
  }

  return (
    <DocumentWorkspace
      email={email ?? ""}
      userId={userId}
      errorMessage={errorMessage}
      onSignOut={handleSignOut}
    />
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { getSupabaseClient } from "@/lib/supabase";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage("");

    try {
      const { error } = await getSupabaseClient().auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      router.replace("/dashboard");
      router.refresh();
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : "Unable to sign in.",
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Box
      component="main"
      sx={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        px: 2,
        py: 6,
        background:
          "radial-gradient(ellipse at 85% 12%, rgba(25, 118, 210, 0.11), transparent 38%), linear-gradient(145deg, #f7faf9 0%, #eef4f3 100%)",
      }}
    >
      <Paper
        variant="outlined"
        sx={{ width: "100%", maxWidth: 440, p: { xs: 3, sm: 4 }, borderRadius: 2 }}
      >
        <Stack component="form" spacing={2.5} onSubmit={handleLogin}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Sign in to Care GP
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Welcome back. Enter your account details to continue.
            </Typography>
          </Box>

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            fullWidth
          />

          {errorMessage && <Alert severity="error">{errorMessage}</Alert>}

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Sign in"}
          </Button>

          <Typography variant="body2" sx={{ textAlign: "center" }} color="text.secondary">
            New to Care GP?{" "}
            <Link component={NextLink} href="/signup" underline="hover">
              Create an account
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
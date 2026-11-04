"use client";

import { useState, type FormEvent } from "react";
import NextLink from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Link from "@mui/material/Link";
import Paper from "@mui/material/Paper";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { getSupabaseClient } from "@/lib/supabase";

export default function SignupPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [showValidation, setShowValidation] = useState(false);

  const normalizedEmail = email.trim();
  const isEmailValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
  const passwordRequirements = [
    password.length >= 8,
    /\d/.test(password),
    /[^A-Za-z0-9]/.test(password),
  ];
  const isPasswordStrong = passwordRequirements.every(Boolean);
  const passwordsMatch = password === confirmPassword;

  async function handleSignup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowValidation(true);
    setIsSubmitting(true);
    setMessage("");
    setHasError(false);

    if (!isEmailValid || !isPasswordStrong || !passwordsMatch) {
      setIsSubmitting(false);
      return;
    }

    try {
      const { error } = await getSupabaseClient().auth.signUp({
        email: normalizedEmail,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/login`,
        },
      });

      if (error) {
        throw error;
      }

      setMessage("Check your email to confirm your account.");
    } catch (error) {
      setHasError(true);
      setMessage(
        error instanceof Error ? error.message : "Unable to create your account.",
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
          "radial-gradient(ellipse at 15% 10%, rgba(0, 150, 136, 0.12), transparent 38%), linear-gradient(145deg, #f7faf9 0%, #eef4f3 100%)",
      }}
    >
      <Paper
        variant="outlined"
        sx={{ width: "100%", maxWidth: 440, p: { xs: 3, sm: 4 }, borderRadius: 2 }}
      >
        <Stack component="form" spacing={2.5} noValidate onSubmit={handleSignup}>
          <Box>
            <Typography component="h1" variant="h4" sx={{ fontWeight: 700 }}>
              Create your Care GP account
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 1 }}>
              Start with your email and a password.
            </Typography>
          </Box>

          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            error={showValidation && !isEmailValid}
            helperText={
              showValidation && !isEmailValid
                ? "Enter a valid email address."
                : " "
            }
            required
            fullWidth
          />
          <TextField
            label="Password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            slotProps={{ htmlInput: { minLength: 8 } }}
            error={showValidation && !isPasswordStrong}
            helperText={
              showValidation && !isPasswordStrong
                ? "Use 8+ characters with a number and a symbol."
                : "8+ characters with a number and a symbol."
            }
            required
            fullWidth
          />
          <TextField
            label="Confirm password"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            error={showValidation && !passwordsMatch}
            helperText={
              showValidation && !passwordsMatch
                ? "Passwords do not match."
                : " "
            }
            required
            fullWidth
          />

          {message && <Alert severity={hasError ? "error" : "success"}>{message}</Alert>}

          <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
            {isSubmitting ? <CircularProgress size={24} color="inherit" /> : "Sign up"}
          </Button>

          <Typography variant="body2" sx={{ textAlign: "center" }} color="text.secondary">
            Already have an account?{" "}
            <Link component={NextLink} href="/login" underline="hover">
              Sign in
            </Link>
          </Typography>
        </Stack>
      </Paper>
    </Box>
  );
}
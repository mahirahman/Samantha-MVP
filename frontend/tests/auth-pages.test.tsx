import { beforeEach, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getSupabaseClient } from "@/lib/supabase";
import LoginPage from "@/app/login/page";
import SignupPage from "@/app/signup/page";
import DashboardPage from "@/app/dashboard/page";
import Home from "@/app/page";

const { router, auth } = vi.hoisted(() => ({
  router: { replace: vi.fn(), refresh: vi.fn() },
  auth: { signInWithPassword: vi.fn(), signUp: vi.fn(), getUser: vi.fn(), signOut: vi.fn() },
}));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("@/lib/supabase", () => ({ getSupabaseClient: vi.fn() }));
vi.mock("@/app/dashboard/document-workspace", () => ({ DocumentWorkspace: ({ onSignOut, errorMessage }: { onSignOut: () => void; errorMessage: string }) => <div><button onClick={onSignOut}>Sign out</button>{errorMessage}</div> }));
beforeEach(() => {
  vi.mocked(getSupabaseClient).mockReturnValue({ auth } as unknown as ReturnType<typeof getSupabaseClient>);
  auth.signInWithPassword.mockResolvedValue({ error: null });
  auth.signUp.mockResolvedValue({ error: null });
  auth.signOut.mockResolvedValue({ error: null });
  auth.getUser.mockResolvedValue({ data: { user: { id: "user", email: "test@example.test" } }, error: null });
});
function fillLogin() {
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: "test@example.test" } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: "Password1!" } });
}
it("signs in and opens the dashboard", async () => {
  render(<LoginPage />); fillLogin();
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/dashboard"));
  expect(auth.signInWithPassword).toHaveBeenCalledWith({ email: "test@example.test", password: "Password1!" });
});
it("shows login failures and allows retry", async () => {
  auth.signInWithPassword.mockResolvedValue({ error: new Error("Invalid credentials") });
  render(<LoginPage />); fillLogin(); fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials");
  expect(screen.getByRole("button", { name: "Sign in" })).toBeEnabled();
  expect(router.replace).not.toHaveBeenCalled();
});
it.each([
  ["invalid", "Password1!", "Password1!", "Enter a valid email address."],
  ["test@example.test", "short", "short", "Use 8+ characters"],
  ["test@example.test", "Password1!", "different", "Passwords do not match."],
])("validates signup before calling the service", async (email, password, confirm, message) => {
  render(<SignupPage />);
  fireEvent.change(screen.getByLabelText(/^Email/), { target: { value: email } });
  fireEvent.change(screen.getByLabelText(/^Password/), { target: { value: password } });
  fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: confirm } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByText((text) => text.includes(message))).toBeInTheDocument();
  expect(auth.signUp).not.toHaveBeenCalled();
});
it("creates an account and requests email confirmation", async () => {
  render(<SignupPage />); fillLogin();
  fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: "Password1!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Check your email");
});
it("shows signup service errors", async () => {
  auth.signUp.mockResolvedValue({ error: new Error("Already registered") });
  render(<SignupPage />); fillLogin();
  fireEvent.change(screen.getByLabelText(/^Confirm password/), { target: { value: "Password1!" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign up" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Already registered");
});
it.each([true, false])("routes the home page according to authentication (%s)", async (signedIn) => {
  auth.getUser.mockResolvedValue({ data: { user: signedIn ? { id: "user" } : null }, error: null });
  render(<Home />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith(signedIn ? "/dashboard" : "/login"));
});
it("protects the dashboard from signed-out users", async () => {
  auth.getUser.mockResolvedValue({ data: { user: null }, error: null }); render(<DashboardPage />);
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
});
it("shows account-loading errors instead of leaving an endless spinner", async () => {
  auth.getUser.mockRejectedValue(new Error("Account service unavailable"));
  render(<DashboardPage />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Account service unavailable");
  expect(screen.queryByLabelText("Loading account")).not.toBeInTheDocument();
});
it("signs out from the dashboard", async () => {
  render(<DashboardPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(router.replace).toHaveBeenCalledWith("/login"));
});
it("keeps the dashboard open when sign-out fails", async () => {
  auth.signOut.mockResolvedValue({ error: new Error("Sign-out failed") }); render(<DashboardPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByText("Sign-out failed")).toBeInTheDocument();
  expect(router.replace).not.toHaveBeenCalled();
});

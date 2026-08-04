import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SignInForm } from "./SignInForm";

const signInWithPassword = vi.fn();

vi.mock("../data/sign-in", () => ({
  signInWithPassword: (params: unknown) => signInWithPassword(params),
}));

function wrapper({ children }: { children: ReactNode }) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe("SignInForm", () => {
  beforeEach(() => {
    signInWithPassword.mockReset();
  });

  it("submits the entered email + password and calls onSuccess once sign-in resolves", async () => {
    signInWithPassword.mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<SignInForm onSuccess={onSuccess} />, { wrapper });

    await user.type(screen.getByLabelText(/email/i), "dealer@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "dealer@example.com",
      password: "s3cret-pass",
    });
  });

  it("shows an inline error (not alert()) and never calls onSuccess when sign-in fails", async () => {
    signInWithPassword.mockRejectedValue(new Error("Invalid login credentials"));
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(<SignInForm onSuccess={onSuccess} />, { wrapper });

    await user.type(screen.getByLabelText(/email/i), "dealer@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "wrong-pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/no pudimos iniciar sesión/i);
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows a loading state and disables the submit button while pending", async () => {
    let resolveSignIn: () => void = () => {};
    signInWithPassword.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSignIn = resolve;
      }),
    );
    const user = userEvent.setup();

    render(<SignInForm />, { wrapper });

    await user.type(screen.getByLabelText(/email/i), "dealer@example.com");
    await user.type(screen.getByLabelText(/contraseña/i), "s3cret-pass");
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }));

    expect(screen.getByRole("button", { name: /ingresando/i })).toBeDisabled();

    resolveSignIn();
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /^iniciar sesión$/i })).not.toBeDisabled(),
    );
  });

  it("never renders sign-up/self-registration content", () => {
    render(<SignInForm />, { wrapper });

    expect(screen.queryByText(/crear cuenta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/registrate/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/olvidaste tu contraseña/i)).not.toBeInTheDocument();
  });
});

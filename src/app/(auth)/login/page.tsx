import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="kl-skeleton h-96 rounded-2xl" />}>
      <LoginForm />
    </Suspense>
  );
}

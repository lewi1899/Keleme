import { Suspense } from "react";
import { RegisterForm } from "./RegisterForm";

export const metadata = { title: "Create your account" };

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="kl-skeleton h-[32rem] rounded-2xl" />}>
      <RegisterForm />
    </Suspense>
  );
}

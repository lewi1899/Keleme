import Link from "next/link";
import { Compass } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="kl-mesh flex min-h-screen flex-col items-center justify-center px-4 py-10">
      <Logo />
      <Card className="mt-8 w-full max-w-md p-8 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-accent-soft text-accent">
          <Compass size={24} />
        </div>
        <h1 className="kl-display mt-4 text-xl font-bold text-text-primary">We couldn&apos;t find that</h1>
        <p className="mt-2 text-sm leading-relaxed text-text-secondary">
          The page may have moved, or it might be content that isn&apos;t part of your grade or plan.
        </p>
        <div className="mt-6 flex justify-center gap-2">
          <Link href="/dashboard">
            <Button>Go to my dashboard</Button>
          </Link>
          <Link href="/learn">
            <Button variant="secondary">Browse subjects</Button>
          </Link>
        </div>
      </Card>
    </div>
  );
}

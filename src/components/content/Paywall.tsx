import Link from "next/link";
import { Crown, GraduationCap, Lock } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

/**
 * Shown in place of a body the student is not entitled to.
 *
 * It names the specific thing that is locked and the specific product that
 * unlocks it. A generic "upgrade to continue" leaves a grade 12 student who
 * already has Premium confused about why a matric paper is still closed —
 * because those are two different purchases.
 */
export function Paywall({
  tier,
  title,
}: {
  tier: "premium" | "matric";
  title: string;
}) {
  const isMatric = tier === "matric";

  return (
    <Card className="p-8 text-center">
      <div
        className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl ${
          isMatric ? "bg-violet-500/12 text-violet-600" : "bg-amber-400/15 text-amber-600"
        }`}
      >
        {isMatric ? <GraduationCap size={24} /> : <Crown size={24} />}
      </div>

      <h2 className="kl-display mt-4 text-xl font-bold text-text-primary">
        {isMatric ? "Part of the Matric Package" : "Part of KELEME Premium"}
      </h2>

      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-text-secondary">
        <span className="font-medium text-text-primary">{title}</span>{" "}
        {isMatric
          ? "is included in the Matric Package — a separate subscription from KELEME Premium, covering every past matric and model paper with answers and explanations."
          : "is included with KELEME Premium, along with every other premium note, textbook and video for your grade."}
      </p>

      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Link href="/premium">
          <Button icon={<Lock size={16} />}>
            {isMatric ? "See the Matric Package" : "See Premium plans"}
          </Button>
        </Link>
        <Link href="/referrals">
          <Button variant="secondary">Earn it by inviting friends</Button>
        </Link>
      </div>

      <p className="mt-4 text-xs text-text-secondary">
        Invite 5 friends who join and get a free month of Premium.
      </p>
    </Card>
  );
}

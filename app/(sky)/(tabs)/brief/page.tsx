import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/States";

export default function BriefPage() {
  return (
    <Sheet title={"Tonight's brief"}>
      <EmptyState text="Your brief appears after your first check-in." />
    </Sheet>
  );
}

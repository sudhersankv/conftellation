import { Sheet } from "@/components/ui/Sheet";
import { EmptyState } from "@/components/ui/States";

export default function CapturePage() {
  return (
    <Sheet title="Capture">
      <EmptyState text="Check in, take a note or log who you met." />
    </Sheet>
  );
}

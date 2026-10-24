import { SkyStage } from "@/components/sky/SkyStage";
import { BackToPill } from "@/components/ui/BackToPill";

// Never give the z-10 wrapper a height or background: chrome is position:fixed so the wrapper stays
// zero-height and the sky canvas still receives taps on /sky.
export default function SkyLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <SkyStage />
      <div className="relative z-10">{children}</div>
      <BackToPill />
    </>
  );
}

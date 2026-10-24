import { TabBar } from "@/components/shell/TabBar";
import { TopBar } from "@/components/shell/TopBar";

export default function TabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TopBar />
      {children}
      <TabBar />
    </>
  );
}

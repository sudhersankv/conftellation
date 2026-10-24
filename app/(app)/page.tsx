// Home: placeholder until the Home agent lands (docs/DESIGN.md §3). Replaced by the real conferences list.
import { redirect } from "next/navigation";

export default function Home() {
  redirect("/plan");
}

import { SessionView } from "@/components/session/SessionView";

export default function SessionPage({ params }: { params: { id: string } }) {
  return <SessionView sessionId={decodeURIComponent(params.id)} />;
}

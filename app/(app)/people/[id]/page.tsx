import { PersonView } from "@/components/people/PersonView";

export default function PersonPage({ params }: { params: { id: string } }) {
  return <PersonView personId={decodeURIComponent(params.id)} />;
}

import { redirect } from "next/navigation";

// Selah opens on Today.
export default function Home() {
  redirect("/today");
}

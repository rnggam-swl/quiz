import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { Playground } from "./Playground";

export const metadata: Metadata = { title: "Playground" };

/** Component gallery for checking tokens and components by eye. Development only. */
export default function PlaygroundPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Playground />;
}

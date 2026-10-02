import { BandMediaClient } from "@/components/bands/band-media-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Media",
};

export default function BandMediaPage() {
  return <BandMediaClient />;
}

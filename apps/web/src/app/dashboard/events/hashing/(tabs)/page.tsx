import { MyHashes } from "@/components/hashing/my-hashes";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hashing",
};

export default function HashingPage() {
  return <MyHashes />;
}

import { CameraPageClient } from "@/components/camera/camera-page-client";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Camera",
};

export default function CameraPage() {
  return <CameraPageClient />;
}

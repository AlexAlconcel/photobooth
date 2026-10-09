import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "momo | Photo Booth",
  description: "A private, browser-based photo booth for little moments.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en"><body>{children}</body></html>
  );
}

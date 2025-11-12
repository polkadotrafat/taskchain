import type { Metadata } from "next";
import { ApiProvider } from '@/app/context/ApiContext';
import { Inter } from "next/font/google";
import { Header } from "./components/Header";  
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "TaskChain",
  description: "Decentralized Freelancing on Polkadot",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ApiProvider>
          <Header /> {/* The Header will now appear on every page */}
          <main className="container mx-auto px-4 py-8">
            {children}
          </main>
        </ApiProvider>
      </body>
    </html>
  );
}

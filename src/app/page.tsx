import { Hero } from "@/components/landing/Hero";
import { Feature } from "@/components/landing/Feature";
import { HowItWorks } from "@/components/landing/HowItWorks";
import { Faq } from "@/components/landing/Faq";
import { Navbar } from "@/components/navbar/Navbar";

export default function Home() {
  return (
    <>
      <Navbar />
      <Hero />
      <Feature />
      <HowItWorks />
      <Faq />
    </>
  );
}
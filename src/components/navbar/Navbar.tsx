"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { BrandLogo } from "@/components/layout/brand-logo";
import styles from "./Navbar.module.css";

const navLinks = [
  { label: "Features", href: "#features" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

const authLinks = [
  { label: "Sign In", href: "/login" },
  { label: "Get Started", href: "/signup", primary: true },
];

export function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const toggleMobileMenu = () => {
    setMobileMenuOpen(!mobileMenuOpen);
  };

  return (
    <motion.nav
      className={styles.navbar}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className={styles.notifyBar}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut", delay: 0.2 }}
      >
        <span className={styles.notifyText}>
          Government agencies can now onboard PGSO — request a demo to get
          started.
        </span>
          <Link href="/contact" className={styles.notifyLink}>
            Request Demo
          </Link>
      </motion.div>

      <div className={styles.container}>
        <motion.div
          className={styles.left}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.3 }}
        >
          <Link href="/" className={styles.logo} aria-label="PGSO EYE home">
            <BrandLogo size={32} />
          </Link>
        </motion.div>

        <div className={styles.center}>
          {navLinks.map((link) => (
            <motion.div
              key={link.label}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
            >
              <Link href={link.href} className={styles.link}>
                {link.label}
              </Link>
            </motion.div>
          ))}
        </div>

        <motion.div
          className={styles.right}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: "easeOut", delay: 0.4 }}
        >
          <div className={styles.authLinks}>
            {authLinks.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className={cn(
                  styles.authLink,
                  link.primary ? styles.authLinkPrimary : ""
                )}
              >
                {link.label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            className={styles.menuButton}
            onClick={toggleMobileMenu}
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? "Close" : "Menu"}
          </button>
        </motion.div>
      </div>

      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            className={styles.mobileMenu}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <div className={styles.mobileNav}>
              {navLinks.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className={styles.mobileLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              ))}
              <div className={styles.mobileAuth}>
                {authLinks.map((link) => (
                  <Link
                    key={link.label}
                    href={link.href}
                    className={cn(
                      styles.mobileAuthLink,
                      link.primary ? styles.mobileAuthLinkPrimary : ""
                    )}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

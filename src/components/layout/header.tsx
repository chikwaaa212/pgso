"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import { BrandLogo } from "@/components/layout/brand-logo";
import styles from "./header.module.css";

interface NavItem {
  label: string;
  href: string;
}

const navItems: NavItem[] = [
  { label: "Home", href: "/" },
  { label: "Docs", href: "https://nextjs.org/docs" },
];

const authPaths = ["/login", "/signup"];

export function Header() {
  const pathname = usePathname();
  const isAuthPage = authPaths.includes(pathname);

  return (
    <motion.header
      className={styles.header}
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className={styles.nav}>
        <Link href="/" className={styles.logo} aria-label="PGSO EYE home">
          <BrandLogo size={30} />
        </Link>

        {isAuthPage ? (
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, ease: "easeOut", delay: 0.2 }}
          >
            <Link href="/" className={styles.backLink} aria-label="Back to home">
              Back
            </Link>
          </motion.div>
        ) : (
          <motion.nav
            className={styles.navLinks}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{
              duration: 0.4,
              ease: "easeOut",
              delay: 0.2,
              staggerChildren: 0.1,
            }}
          >
            {navItems.map((item) => (
              <motion.div
                key={item.href}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <Link
                  href={item.href}
                  className={styles.navLink}
                  {...(item.href.startsWith("http")
                    ? { target: "_blank", rel: "noopener noreferrer" }
                    : {})}
                >
                  {item.label}
                </Link>
              </motion.div>
            ))}
          </motion.nav>
        )}
      </div>
    </motion.header>
  );
}

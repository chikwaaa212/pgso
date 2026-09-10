"use client";

import Link from "next/link";
import { GitFork, Rss, Share2, Globe, Send } from "lucide-react";
import { motion } from "framer-motion";
import { FOOTER_COLUMNS } from "@/lib/footer-content";
import { BrandLogo } from "@/components/layout/brand-logo";
import styles from "./footer.module.css";

const socialLinks: {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { href: "https://github.com", label: "GitHub", icon: GitFork },
  { href: "https://pgso.dev", label: "Website", icon: Globe },
  { href: "https://pgso.dev/blog", label: "Blog", icon: Rss },
  { href: "https://twitter.com", label: "Social", icon: Share2 },
  { href: "mailto:support@pgso.dev", label: "Contact", icon: Send },
];

export function Footer() {
  return (
    <motion.footer
      className={styles.footer}
      initial={{ opacity: 0, y: 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <motion.div
        className={styles.container}
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6, ease: "easeOut", delay: 0.1 }}
      >
        <motion.div
          className={styles.top}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-50px 0px" }}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.15, delayChildren: 0.15 },
            },
          }}
        >
          <motion.div
            className={styles.branding}
            variants={{
              hidden: { opacity: 0, x: -30 },
              visible: { opacity: 1, x: 0 },
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            <Link href="/" className={styles.logo} aria-label="PGSO EYE home">
              <BrandLogo size={36} />
            </Link>
            <p className={styles.description}>
              An integrated web-based property and supply management system
              with business analytics for operational monitoring and asset
              accountability.
            </p>
            <motion.div
              className={styles.social}
              variants={{
                hidden: { opacity: 0 },
                visible: {
                  opacity: 1,
                  transition: { staggerChildren: 0.1 },
                },
              }}
            >
              {socialLinks.map((social) => (
                <motion.a
                  key={social.href}
                  href={social.href}
                  target={
                    social.href.startsWith("http") ? "_blank" : undefined
                  }
                  rel={
                    social.href.startsWith("http")
                      ? "noopener noreferrer"
                      : undefined
                  }
                  className={styles.socialLink}
                  aria-label={social.label}
                  variants={{
                    hidden: { opacity: 0, scale: 0.8 },
                    visible: { opacity: 1, scale: 1 },
                  }}
                  transition={{ duration: 0.4, ease: "easeOut" }}
                  whileHover={{ scale: 1.1 }}
                >
                  <social.icon className={styles.socialIcon} />
                </motion.a>
              ))}
            </motion.div>
          </motion.div>

          <motion.div
            className={styles.columns}
            variants={{
              hidden: { opacity: 0, x: 30 },
              visible: { opacity: 1, x: 0 },
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          >
            {FOOTER_COLUMNS.map((column) => (
              <motion.div
                key={column.title}
                className={styles.column}
                variants={{
                  hidden: { opacity: 0, y: 20 },
                  visible: { opacity: 1, y: 0 },
                }}
                transition={{ duration: 0.5, ease: "easeOut" }}
              >
                <h3 className={styles.columnTitle}>{column.title}</h3>
                <ul className={styles.linkList}>
                  {column.links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={`/info/${link.slug}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={styles.link}
                      >
                        {link.label}
                        {link.badge && (
                          <span className={styles.badge}>HIRING</span>
                        )}
                      </a>
                    </li>
                  ))}
                </ul>
              </motion.div>
            ))}
          </motion.div>
        </motion.div>

        <motion.div
          className={styles.bottom}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          transition={{ duration: 0.5, ease: "easeOut", delay: 0.4 }}
        >
          <p className={styles.copyright}>
            &copy; {new Date().getFullYear()} PGSO. All rights reserved.
          </p>
        </motion.div>
      </motion.div>
    </motion.footer>
  );
}

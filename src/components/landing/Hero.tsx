"use client";

import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import styles from "./Hero.module.css";

export function Hero() {
  const handleScrollTo = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  return (
    <section className={styles.section}>
      <motion.div
        className={styles.gridOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.3 }}
      />
      <motion.div
        className={styles.noiseOverlay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.05 }}
      />
      <motion.div
        className={styles.glow1}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.05, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut" }}
      />
      <motion.div
        className={styles.glow2}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.05, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.1 }}
      />
      <motion.div
        className={styles.ring1}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.2, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.2 }}
      />
      <motion.div
        className={styles.ring2}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 0.15, scale: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.3 }}
      />

      <motion.div
        className={styles.content}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut", delay: 0.2 }}
      >
        <div className={styles.container}>
          <motion.span
            className={styles.badge}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.3 }}
          >
            Provincial Government Services
          </motion.span>
          <motion.h1
            className={styles.title}
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, ease: "easeOut", delay: 0.4 }}
          >
            Property & Supply<br />Management System
          </motion.h1>
          <motion.p
            className={styles.subtitle}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.5 }}
          >
            Modern web-based platform for efficient property tracking, supply management,
            and operational monitoring across provincial departments.
          </motion.p>
          <motion.div
            className={styles.buttonGroup}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: "easeOut", delay: 0.6 }}
          >
            <Button
              className={styles.primaryButton}
              onClick={() => handleScrollTo("features")}
            >
              Explore Features
            </Button>
            <Button
              className={styles.secondaryButton}
              onClick={() => handleScrollTo("about")}
            >
              Learn More
            </Button>
          </motion.div>
        </div>
      </motion.div>
      <motion.div
        className={styles.divider}
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={{ duration: 0.8, ease: "easeOut", delay: 0.7 }}
      />
    </section>
  );
}

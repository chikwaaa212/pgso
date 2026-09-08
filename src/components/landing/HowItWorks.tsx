"use client";

import { LayoutTemplate, Package, BarChart3 } from "lucide-react";
import { motion, Variants, Transition } from "framer-motion";
import { Card } from "@/components/ui/card";
import styles from "./HowItWorks.module.css";

interface Step {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const steps: Step[] = [
  {
    title: "Track Assets",
    description: "Register and monitor property across all departments in real-time",
    icon: LayoutTemplate,
  },
  {
    title: "Manage Supply",
    description: "Handle procurement, distribution, and inventory with automated workflows",
    icon: Package,
  },
  {
    title: "Monitor & Report",
    description: "Generate analytics and audit-ready reports for decision-making",
    icon: BarChart3,
  },
];

export function HowItWorks() {
  return (
    <motion.section
      className={styles.section}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin: "-100px 0px" }}
      variants={{
        hidden: { opacity: 0 },
        visible: {
          opacity: 1,
          transition: { staggerChildren: 0.2, delayChildren: 0.1 },
        },
      }}
    >
      <div className={styles.container}>
        <motion.div
          className={styles.badge}
          variants={{
            hidden: { opacity: 0, y: 20 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.5, ease: "easeOut" }}
        >
          <LayoutTemplate className={styles.badgeIcon} />
          How it works
        </motion.div>

        <motion.div
          className={styles.header}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h2 className={styles.title}>Your complete property workflow in three steps</h2>
          <p className={styles.description}>
            A streamlined process for efficient property and supply management
          </p>
        </motion.div>

        <div className={styles.mobile}>
          {steps.map((step, index) => (
            <StepItem
              key={step.title}
              step={step}
              index={index}
              isLast={index === steps.length - 1}
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              styles={styles}
            />
          ))}
        </div>

        <div className={styles.desktop}>
          {steps.map((step, index) => (
            <StepItem
              key={step.title}
              step={step}
              index={index}
              isLast={index === steps.length - 1}
              variants={{
                hidden: { opacity: 0, y: 30 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              styles={styles}
            />
          ))}
        </div>
      </div>
    </motion.section>
  );
}

function StepItem({
  step,
  isLast,
  variants,
  transition: transitionProp,
  styles,
}: {
  step: Step;
  index: number;
  isLast: boolean;
  variants?: Variants;
  transition?: Transition;
  styles: Record<string, string>;
}) {
  const StepIcon = step.icon;
  return (
    <motion.div
      className={styles.step}
      variants={variants}
      transition={transitionProp}
    >
      <motion.div
        className={styles.stepIconWrapper}
        variants={{
          hidden: { opacity: 0, scale: 0.8 },
          visible: { opacity: 1, scale: 1 },
        }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <StepIcon className={styles.stepIconDesktop} />
      </motion.div>
      {!isLast && (
        <svg
          className={styles.arrow}
          viewBox="0 0 200 50"
          fill="none"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <path
            d="M0,25 C60,5 140,45 200,25"
            stroke="currentColor"
            strokeWidth="2"
            strokeDasharray="8 4"
          />
        </svg>
      )}
      <Card className={styles.stepCard}>
        <h3 className={styles.stepTitle}>{step.title}</h3>
        <p className={styles.stepDescription}>{step.description}</p>
      </Card>
    </motion.div>
  );
}

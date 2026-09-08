"use client";

import Image from "next/image";
import { FileText, Calendar, Puzzle, BookOpen, BarChart3, Layout } from "lucide-react";
import { motion, Variants, Transition } from "framer-motion";
import styles from "./Feature.module.css";

interface FeatureItem {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const leftFeatures: FeatureItem[] = [
  {
    title: "Property Tracking",
    description: "Track assets and inventory across departments with real-time visibility",
    icon: FileText,
  },
  {
    title: "Supply Management",
    description: "Manage procurement, distribution, and supply chains efficiently",
    icon: Calendar,
  },
  {
    title: "Audit & Compliance",
    description: "Maintain audit trails and compliance records for all transactions",
    icon: Puzzle,
  },
];

const rightFeatures: FeatureItem[] = [
  {
    title: "Analytics & Reports",
    description: "Generate insights and detailed reports from your property data",
    icon: BookOpen,
  },
  {
    title: "QR Code Integration",
    description: "Scan assets instantly for quick access and verification",
    icon: BarChart3,
  },
  {
    title: "Multi-role Access",
    description: "Dedicated dashboards for employees, personnel, and administrators",
    icon: Layout,
  },
];

export function Feature() {
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
          transition: { staggerChildren: 0.15, delayChildren: 0.1 },
        },
      }}
    >
      <div className={styles.container}>
        <motion.header
          className={styles.header}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <h2 className={styles.title}>Our Advanced Capabilities</h2>
          <p className={styles.description}>
            Leveraging innovation to make property and supply management clearer,
            more intelligent, and more valuable.
          </p>
        </motion.header>

        <div className={styles.grid}>
          <div className={styles.featureList}>
            {leftFeatures.map((feature) => (
              <FeatureItem_
                key={feature.title}
                feature={feature}
                variants={{
                  hidden: { opacity: 0, x: -30 },
                  visible: { opacity: 1, x: 0 },
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            ))}
          </div>

          <figure className={styles.figure}>
            <motion.div
              className={styles.imageWrapper}
              variants={{
                hidden: { opacity: 0, scale: 0.9 },
                visible: { opacity: 1, scale: 1 },
              }}
              transition={{ duration: 0.7, ease: "easeOut" }}
            >
              <Image
                src="https://images.unsplash.com/photo-1551721434-8b94ddff0e6d?q=80&w=1000&auto=format&fit=crop"
                alt="Property management dashboard"
                width={500}
                height={500}
                className={styles.image}
              />
            </motion.div>
          </figure>

          <div className={styles.featureList}>
            {rightFeatures.map((feature) => (
              <FeatureItem_
                key={feature.title}
                feature={feature}
                variants={{
                  hidden: { opacity: 0, x: 30 },
                  visible: { opacity: 1, x: 0 },
                }}
                transition={{ duration: 0.6, ease: "easeOut" }}
              />
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}

function FeatureItem_({
  feature,
  variants,
  transition,
}: {
  feature: FeatureItem;
  variants?: Variants;
  transition?: Transition;
}) {
  const { title, description, icon: Icon } = feature;
  return (
    <motion.div
      className={styles.featureItem}
      variants={variants}
      transition={transition}
    >
      <div className={styles.iconWrapper}>
        <Icon className="h-5 w-5" />
      </div>
      <div className={styles.featureContent}>
        <h3 className={styles.featureTitle}>{title}</h3>
        <p className={styles.featureDescription}>{description}</p>
      </div>
    </motion.div>
  );
}

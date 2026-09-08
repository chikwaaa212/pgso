"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import styles from "./Faq.module.css";

interface FaqItem {
  question: string;
  answer: string;
}

const faqs: FaqItem[] = [
  {
    question: "How long does it take to implement the system?",
    answer:
      "Implementation typically takes 4-8 weeks depending on the size of your organization. Our team handles all setup, data migration, training, and go-live support so your team can focus on running operations.",
  },
  {
    question: "Can I access the system remotely?",
    answer:
      "Yes. PGSO is a cloud-based platform accessible from any device with an internet connection. Real-time data syncs across departments so personnel can work from the office, field, or home.",
  },
  {
    question: "What data security measures are in place?",
    answer:
      "All data is encrypted in transit and at rest using AES-256. We enforce role-based access control, audit trails, and regular security audits to meet government compliance standards.",
  },
  {
    question: "Is training provided for my team?",
    answer:
      "Yes, we provide role-specific onboarding sessions, interactive guides, and ongoing support. Your designated administrators also receive advanced training for managing users and workflows.",
  },
  {
    question: "Can existing data be migrated into PGSO?",
    answer:
      "Yes. We support import from common spreadsheet and database formats. Our team works with you to map fields, clean data, and validate accuracy before going live.",
  },
];

export function Faq() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggle = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section className={styles.section}>
      <motion.div
        className={styles.container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
        variants={{
          hidden: { opacity: 0 },
          visible: {
            opacity: 1,
            transition: { staggerChildren: 0.1, delayChildren: 0.2 },
          },
        }}
      >
        <motion.div
          className={styles.header}
          variants={{
            hidden: { opacity: 0, y: 30 },
            visible: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.6, ease: "easeOut" }}
        >
          <span className={styles.subtitle}>FAQ&apos;s</span>
          <h2 className={styles.title}>Got questions? Say less, we&apos;ve got answers!</h2>
        </motion.div>

        <motion.div
          className={styles.accordion}
          variants={{
            hidden: { opacity: 0 },
            visible: {
              opacity: 1,
              transition: { staggerChildren: 0.1, delayChildren: 0.3 },
            },
          }}
        >
          {faqs.map((faq, index) => (
            <motion.div
              key={faq.question}
              className={styles.item}
              variants={{
                hidden: { opacity: 0, y: 20 },
                visible: { opacity: 1, y: 0 },
              }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <button
                type="button"
                className={styles.question}
                onClick={() => toggle(index)}
                aria-expanded={openIndex === index}
                aria-controls={`faq-answer-${index}`}
                id={`faq-question-${index}`}
              >
                <span>{faq.question}</span>
                <motion.div
                  animate={{ rotate: openIndex === index ? 180 : 0 }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <ChevronDown
                    className={cn(
                      styles.icon,
                      openIndex === index ? styles.iconOpen : ""
                    )}
                    aria-hidden="true"
                  />
                </motion.div>
              </button>
              <AnimatePresence initial={false}>
                {openIndex === index && (
                  <motion.div
                    id={`faq-answer-${index}`}
                    role="region"
                    aria-labelledby={`faq-question-${index}`}
                    className={styles.answer}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                  >
                    <p>{faq.answer}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </motion.div>
    </section>
  );
}

function cn(...classes: string[]) {
  return classes.filter(Boolean).join(" ");
}

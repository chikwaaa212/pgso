import { PersonnelSidebar } from "@/components/personnel/PersonnelSidebar";
import styles from "./layout.module.css";

export const dynamic = "force-dynamic";

export default function PersonnelLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className={styles.shell}>
      <PersonnelSidebar />
      <div className={styles.main}>{children}</div>
    </div>
  );
}

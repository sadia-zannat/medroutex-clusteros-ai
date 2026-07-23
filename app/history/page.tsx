import type { Metadata } from "next";
import HistoryClient from "./_components/history-client";

export const metadata: Metadata = {
  title: "Unified History | ClusterOS AI: MedRouteX",
  description:
    "Operational events, notifications, Hospital Twin snapshots, decisions, audits, and email-delivery history for the MedRouteX infrastructure decision-support prototype.",
};

export default function HistoryPage() {
  return <HistoryClient />;
}

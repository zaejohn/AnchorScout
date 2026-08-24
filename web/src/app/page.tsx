import { AnchorScoutApp } from "@/components/anchor-scout-app";
import { hasContractDeployment } from "@/lib/stellar/config";

export default function Home() {
  return <AnchorScoutApp contractsConfigured={hasContractDeployment()} />;
}


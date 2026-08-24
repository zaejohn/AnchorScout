import { AnchorScoutApp } from "@/components/anchor-scout-app";
import { hasExecutableDeployment } from "@/lib/stellar/config";

export default function AppPage() {
  return <AnchorScoutApp contractsConfigured={hasExecutableDeployment()} />;
}

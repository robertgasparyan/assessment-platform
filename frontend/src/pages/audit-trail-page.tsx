import { Navigate } from "react-router-dom";

export function AuditTrailPage() {
  return <Navigate replace to="/administration?tab=audit" />;
}

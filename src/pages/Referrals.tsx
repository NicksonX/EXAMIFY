import { Navigate } from "react-router-dom";

// Keep the historic URL from exposing the retired referral-to-Wallet flow.
export function Referrals() {
  return <Navigate to="/wallet" replace />;
}

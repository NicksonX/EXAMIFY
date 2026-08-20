import { Routes, Route } from "react-router-dom";
import { Landing } from "@/pages/Landing";
import { Login } from "@/pages/Login";
import { AuthCallback } from "@/pages/AuthCallback";
import { Dashboard } from "@/pages/Dashboard";
import { Exam } from "@/pages/Exam";
import { Result } from "@/pages/Result";
import { Upgrade } from "@/pages/Upgrade";
import { Practice } from "@/pages/Practice";
import { Results } from "@/pages/Results";
import { MainExams } from "@/pages/MainExams";
import { Assessment } from "@/pages/Assessment";
import { BillingReturn } from "@/pages/BillingReturn";
import { Study } from "@/pages/Study";
import { StudyView } from "@/pages/StudyView";
import { NotFound } from "@/pages/NotFound";
import { Wallet } from "@/pages/Wallet";
import { WalletReturn } from "@/pages/WalletReturn";
import { Referrals } from "@/pages/Referrals";
import { Settings } from "@/pages/Settings";
import { Admin } from "@/pages/Admin";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { AdminRoute } from "@/components/AdminRoute";
import { AppShell } from "@/components/AppShell";
import { EditorialShell } from "@/components/EditorialShell";
import { OnboardingGate } from "@/components/OnboardingGate";
import { Help } from "@/pages/Help";
import { Onboarding } from "@/pages/Onboarding";
import { Terms } from "@/pages/Terms";

export default function App() {
  return (
    <Routes>
      <Route element={<EditorialShell />}>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/terms" element={<Terms />} />
        <Route path="/help" element={<Help />} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route element={<ProtectedRoute><OnboardingGate><EditorialShell /></OnboardingGate></ProtectedRoute>}>
        <Route path="/onboarding" element={<Onboarding />} />
        <Route path="/terms/accept" element={<Terms acceptanceRequired />} />
      </Route>

      <Route element={<ProtectedRoute><EditorialShell /></ProtectedRoute>}>
        <Route path="/billing/return" element={<BillingReturn />} />
        <Route path="/wallet/return" element={<WalletReturn />} />
      </Route>

      <Route element={<ProtectedRoute><OnboardingGate><AppShell /></OnboardingGate></ProtectedRoute>}>
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/practice" element={<Practice />} />
        <Route path="/main-exams" element={<MainExams />} />
        <Route path="/assessment/attempt/:attemptId" element={<Assessment />} />
        <Route path="/assessment/:definitionId" element={<Assessment />} />
        <Route path="/results" element={<Results />} />
        <Route path="/study" element={<Study />} />
        <Route path="/study/:id" element={<StudyView />} />
        <Route path="/result/:id" element={<Result />} />
        <Route path="/upgrade" element={<Upgrade />} />
        <Route path="/wallet" element={<Wallet />} />
        <Route path="/referrals" element={<Referrals />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/admin" element={<AdminRoute><Admin /></AdminRoute>} />
      </Route>

      <Route path="/exam" element={<ProtectedRoute><OnboardingGate><Exam /></OnboardingGate></ProtectedRoute>} />
    </Routes>
  );
}

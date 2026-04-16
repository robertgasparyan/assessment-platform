import { Suspense, lazy } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "@/features/auth-context";
import { ActivateAccountPage } from "@/pages/activate-account-page";
import { ForcePasswordChangePage } from "@/pages/force-password-change-page";
import { AppShell } from "@/layouts/app-shell";
import { LoginPage } from "@/pages/login-page";

const DashboardPage = lazy(() => import("@/pages/dashboard-page").then((module) => ({ default: module.DashboardPage })));
const TemplatesPage = lazy(() => import("@/pages/templates-page").then((module) => ({ default: module.TemplatesPage })));
const LibrariesPage = lazy(() => import("@/pages/libraries-page").then((module) => ({ default: module.LibrariesPage })));
const TeamsPage = lazy(() => import("@/pages/teams-page").then((module) => ({ default: module.TeamsPage })));
const AdministrationPage = lazy(() => import("@/pages/administration-page").then((module) => ({ default: module.AdministrationPage })));
const AssessmentsPage = lazy(() => import("@/pages/assessments-page").then((module) => ({ default: module.AssessmentsPage })));
const MyAssessmentsPage = lazy(() => import("@/pages/my-assessments-page").then((module) => ({ default: module.MyAssessmentsPage })));
const ReportsPage = lazy(() => import("@/pages/reports-page").then((module) => ({ default: module.ReportsPage })));
const SharedResultsPage = lazy(() => import("@/pages/shared-results-page").then((module) => ({ default: module.SharedResultsPage })));
const GuestAssessmentPage = lazy(() => import("@/pages/guest-assessment-page").then((module) => ({ default: module.GuestAssessmentPage })));
const GuestSharedResultsPage = lazy(() => import("@/pages/guest-shared-results-page").then((module) => ({ default: module.GuestSharedResultsPage })));
const AssessmentRunPage = lazy(() =>
  import("@/pages/assessment-run-page").then((module) => ({ default: module.AssessmentRunPage }))
);
const ResultsPage = lazy(() => import("@/pages/results-page").then((module) => ({ default: module.ResultsPage })));

function RouteFallback() {
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="h-4 w-24 animate-pulse rounded-full bg-muted" />
        <div className="h-10 w-72 animate-pulse rounded-2xl bg-muted" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div className="rounded-[1.5rem] border bg-white p-6" key={`route-fallback-card-${index}`}>
            <div className="h-5 w-28 animate-pulse rounded-full bg-muted" />
            <div className="mt-4 h-20 animate-pulse rounded-[1.25rem] bg-muted/70" />
          </div>
        ))}
      </div>
      <div className="rounded-[1.5rem] border bg-white p-6">
        <div className="h-5 w-32 animate-pulse rounded-full bg-muted" />
        <div className="mt-5 h-[320px] animate-pulse rounded-[1.25rem] bg-muted/70" />
      </div>
    </div>
  );
}

export default function App() {
  const { isAuthenticated, isLoading, mustChangePassword } = useAuth();

  if (window.location.pathname === "/activate-account") {
    return <ActivateAccountPage />;
  }

  if (window.location.pathname.startsWith("/shared-results/")) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/shared-results/:token" element={<SharedResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (window.location.pathname.startsWith("/guest-assessments/")) {
    return (
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/guest-assessments/:token" element={<GuestAssessmentPage />} />
          <Route path="/guest-assessments/:token/results" element={<GuestSharedResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    );
  }

  if (isLoading) {
    return <RouteFallback />;
  }

  if (!isAuthenticated) {
    return <LoginPage />;
  }

  if (mustChangePassword) {
    return <ForcePasswordChangePage />;
  }

  return (
    <AppShell>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/templates" element={<TemplatesPage />} />
          <Route path="/libraries" element={<LibrariesPage />} />
          <Route path="/teams" element={<TeamsPage />} />
          <Route path="/administration" element={<AdministrationPage />} />
          <Route path="/users" element={<Navigate replace to="/administration?tab=users" />} />
          <Route path="/audit-trail" element={<Navigate replace to="/administration?tab=audit" />} />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/my-assessments" element={<MyAssessmentsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/assessments/:runId" element={<AssessmentRunPage />} />
          <Route path="/assessments/:runId/results" element={<ResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </AppShell>
  );
}

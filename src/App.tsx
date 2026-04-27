import '@/lib/sentry';
import { lazy, Suspense } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { ActionsProvider } from '@/context/ActionsContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { ErrorBusProvider } from '@/components/ErrorBus';
import { Layout } from '@/components/Layout';
import DashboardOverview from '@/pages/DashboardOverview';
import AdminPage from '@/pages/AdminPage';
import MitarbeiterPage from '@/pages/MitarbeiterPage';
import SchichtvorlagenPage from '@/pages/SchichtvorlagenPage';
import VerfuegbarkeitPage from '@/pages/VerfuegbarkeitPage';
import SchichtzuweisungenPage from '@/pages/SchichtzuweisungenPage';
import PublicFormMitarbeiter from '@/pages/public/PublicForm_Mitarbeiter';
import PublicFormSchichtvorlagen from '@/pages/public/PublicForm_Schichtvorlagen';
import PublicFormVerfuegbarkeit from '@/pages/public/PublicForm_Verfuegbarkeit';
import PublicFormSchichtzuweisungen from '@/pages/public/PublicForm_Schichtzuweisungen';
// <public:imports>
// </public:imports>
// <custom:imports>
const SchichtplanungPage = lazy(() => import('@/pages/intents/SchichtplanungPage'));
const WochenplanPage = lazy(() => import('@/pages/intents/WochenplanPage'));
// </custom:imports>

export default function App() {
  return (
    <ErrorBoundary>
      <ErrorBusProvider>
        <HashRouter>
          <ActionsProvider>
            <Routes>
              <Route path="public/69ef6388b28deed69bebae76" element={<PublicFormMitarbeiter />} />
              <Route path="public/69ef638f9a9152e2ea3688e3" element={<PublicFormSchichtvorlagen />} />
              <Route path="public/69ef63909310729986d3d860" element={<PublicFormVerfuegbarkeit />} />
              <Route path="public/69ef6391561612c76f338dfc" element={<PublicFormSchichtzuweisungen />} />
              {/* <public:routes> */}
              {/* </public:routes> */}
              <Route element={<Layout />}>
                <Route index element={<DashboardOverview />} />
                <Route path="mitarbeiter" element={<MitarbeiterPage />} />
                <Route path="schichtvorlagen" element={<SchichtvorlagenPage />} />
                <Route path="verfuegbarkeit" element={<VerfuegbarkeitPage />} />
                <Route path="schichtzuweisungen" element={<SchichtzuweisungenPage />} />
                <Route path="admin" element={<AdminPage />} />
                {/* <custom:routes> */}
                <Route path="intents/schichtplanung" element={<Suspense fallback={null}><SchichtplanungPage /></Suspense>} />
                <Route path="intents/wochenplan" element={<Suspense fallback={null}><WochenplanPage /></Suspense>} />
                {/* </custom:routes> */}
              </Route>
            </Routes>
          </ActionsProvider>
        </HashRouter>
      </ErrorBusProvider>
    </ErrorBoundary>
  );
}

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';

import { parseAppRoute, type AppRoute } from './lib/routes';
import { ProjectCanvasPage } from './pages/ProjectCanvasPage';
import { ProjectsPage } from './pages/ProjectsPage';

function getCurrentRoute() {
  if (typeof window === 'undefined') return { name: 'projects' } as const;
  return parseAppRoute(window.location.pathname);
}

export function AppRouter({ route }: { route: AppRoute }) {
  if (route.name === 'project') {
    return <ProjectCanvasPage projectId={route.projectId} />;
  }

  return <ProjectsPage />;
}

export default function App() {
  const [route, setRoute] = useState<AppRoute>(() => getCurrentRoute());

  useEffect(() => {
    const handleRouteChange = () => setRoute(getCurrentRoute());

    window.addEventListener('popstate', handleRouteChange);
    return () => window.removeEventListener('popstate', handleRouteChange);
  }, []);

  return (
    <AppRouter route={route} />
  );
}

import React from "react";

const DesignPage = React.lazy(() => import("./DesignPage"));

/** Dev-only `/design` route target: lazy so the page never ships in the production bundle. */
export const DesignRoute: React.FC = () => (
  <React.Suspense fallback={null}>
    <DesignPage />
  </React.Suspense>
);

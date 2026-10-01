import React, { useMemo } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { useCatalog } from "./catalog/CatalogContext";
import { SpecTable } from "./design/SpecTable";
import { MyFitsSection } from "./fits/MyFitsSection";

export const ProfilePage: React.FC = () => {
  const { user, logout } = useAuth();
  const { userBikes } = useCatalog();

  const myBikes = useMemo(
    () => userBikes.filter((b) => b.submitted_by_user_id === user?.id),
    [userBikes, user],
  );

  if (!user) return null;

  return (
    <div className="profile-page">
      <header className="profile-page__header">
        <div>
          <div className="ff-eyebrow">Account</div>
          <h1>{user.email}</h1>
          <p>Joined {new Date(user.created_at).toLocaleDateString()}</p>
        </div>
        <button type="button" className="ff-pill ff-pill--ghost" onClick={logout}>
          Sign out
        </button>
      </header>

      <MyFitsSection />

      <section className="profile-section">
        <div className="ff-eyebrow">My submitted bikes</div>
        {myBikes.length === 0 ? (
          <div className="empty-state">
            <p>No bikes yet — share a frame's geometry with the catalog.</p>
            <Link to="/add" className="primary-btn">
              Add a bike
            </Link>
          </div>
        ) : (
          <>
            <SpecTable
              sections={[
                {
                  rows: myBikes.map((b) => ({
                    label: (
                      <>
                        <strong>{b.brand}</strong> {b.model} ({b.launch_year})
                      </>
                    ),
                    value: String(b.sizes.length),
                    unit: b.sizes.length === 1 ? "size" : "sizes",
                  })),
                },
              ]}
            />
            <Link to="/add" className="link-btn profile-section__manage">
              Manage bikes
            </Link>
          </>
        )}
      </section>
    </div>
  );
};

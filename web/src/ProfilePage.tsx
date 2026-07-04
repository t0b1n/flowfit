import React, { useMemo } from "react";
import { Link } from "react-router-dom";

import { useAuth } from "./auth/AuthContext";
import { useCatalog } from "./catalog/CatalogContext";

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
          <div className="eyebrow">Account</div>
          <h1>{user.email}</h1>
          <p>Joined {new Date(user.created_at).toLocaleDateString()}</p>
        </div>
        <button className="link-btn" onClick={logout}>
          Sign out
        </button>
      </header>

      <section>
        <h2>My submitted bikes</h2>
        {myBikes.length === 0 ? (
          <p>
            None yet. <Link to="/add">Add a bike</Link> to share its geometry with the catalog.
          </p>
        ) : (
          <ul className="profile-bikes">
            {myBikes.map((b) => (
              <li key={b.id}>
                <strong>{b.brand}</strong> {b.model} ({b.launch_year}) — {b.sizes.length} size
                {b.sizes.length === 1 ? "" : "s"}
                <Link to="/add" className="link-btn">
                  Manage
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
